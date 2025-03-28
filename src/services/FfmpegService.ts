import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { createWriteStream } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import { Readable } from 'stream';
import { FfmpegLoudnormMeasurementResult, VideoRenderResult } from '../types';
import { FileSessionService } from './FileSessionService';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export class FfmpegService {

  public merge(fileList: string[]): Promise<VideoRenderResult> {
    return new Promise((resolve, reject) => {
      const firstInput = fileList.shift();

      let fluentInterface = ffmpeg(firstInput);

      for (const filePath of fileList) {
        fluentInterface = fluentInterface.input(filePath);
      }

      const outputPath = join(tmpdir(), `${uuidv4()}.mp4`);
      fluentInterface
        .on('end', async () => {
          const buffer = await readFile(outputPath);
          await unlink(outputPath);
          resolve({
            buffer,
            durationMs: await this.getDurationFromBuffer(buffer),
          });
        })
        .on('error', reject);
      fluentInterface.mergeToFile(outputPath, tmpdir());
    });
  }

  public async replaceAudioIntoVideo(
    videoFilePath: string | Readable,
    audioFilePath: string | Readable,
    audioDelay: number = 0,
    volume: number = 1,
  ): Promise<Buffer> {
    const tmpFilePath = join(tmpdir(), `${uuidv4()}.mp4`);
    if (videoFilePath instanceof Readable) {
      videoFilePath.pipe(createWriteStream(tmpFilePath));
      videoFilePath = tmpFilePath;
    }
    return new Promise((resolve, reject) => {
      const outputPath = join(tmpdir(), `${uuidv4()}.mp4`);
      ffmpeg(videoFilePath)
        .input(audioFilePath)
        .addOption('-c:v copy')
        .complexFilter(
          `[1:a] volume=${volume.toFixed(2)},adelay=${parseInt(`${audioDelay}`, 10)}|${parseInt(`${audioDelay}`, 10)}`,
        )
        .addOption('-map 0')
        .addOption('-map 1:a')
        // .on("start", console.log)
        .on('end', async function () {
          const buffer = await readFile(outputPath);
          await unlink(videoFilePath as string);
          await unlink(outputPath);
          resolve(buffer);
        })
        .on('error', reject)
        .saveToFile(outputPath);
    });
  }

  public async mixinAudio(
    videoWithAudioFile: string | Readable,
    audioFile: string | Readable,
    audioDelay: number = 0,
    volume: number = 1,
  ): Promise<Buffer> {
    const tmpFilePath = join(tmpdir(), `${uuidv4()}.mp3`);
    if (videoWithAudioFile instanceof Readable) {
      videoWithAudioFile.pipe(createWriteStream(tmpFilePath));
      videoWithAudioFile = tmpFilePath;
    }
    return new Promise((resolve, reject) => {
      const outputPath = join(tmpdir(), `${uuidv4()}.mp4`);
      ffmpeg(videoWithAudioFile)
        .input(audioFile)
        .complexFilter([
          `[1:a] volume=${volume.toFixed(2)},adelay=${parseInt(`${audioDelay}`, 10)}|${parseInt(`${audioDelay}`, 10)} [voice]`,
          `[0:a][voice] amix=inputs=2:duration=longest [audio_out]`,
        ])
        .addOption('-map 0:v')
        .addOption('-map [audio_out]')
        .addOption('-shortest')
        // .on("start", console.log)
        .on('end', async function () {
          const buffer = await readFile(outputPath);
          await unlink(outputPath);
          await unlink(tmpFilePath);
          resolve(buffer);
        })
        .on('error', reject)
        .saveToFile(outputPath);
    });
  }

  public async cut(
    videoFileBuffer: Buffer,
    startMs?: number | undefined,
    endMs?: number | undefined,
  ): Promise<Buffer> {
    const sourceFileSession = new FileSessionService('mp4');
    const outputFileSession = new FileSessionService('mp4');
    await sourceFileSession.write(videoFileBuffer);
    return  new Promise((resolve, reject) => {
      let ffmpegInterface = ffmpeg();
      if (startMs) {
        ffmpegInterface = ffmpegInterface.addOption(`-ss ${startMs}ms`);
      }
      ffmpegInterface = ffmpegInterface
        .addOption(`-accurate_seek`)
        .addOption(`-i ${sourceFileSession.filePath}`);
      if (endMs) {
        ffmpegInterface = ffmpegInterface.addOption(`-to ${endMs}ms`);
      }
      ffmpegInterface
        .addOption(`-map 0`)
        .addOption(`-shortest`)
        .addOption(`-crf 23`)
        .on('end', async function () {
          resolve(await outputFileSession.waitForRead());
          void outputFileSession.delete();
        })
        .on('error', async function () {
          reject();
          void outputFileSession.delete();
        })
        .saveToFile(outputFileSession.filePath);
    });
  }

  public async getDurationFromBuffer(
    buffer: Buffer,
    fileExtension: string = 'mp4',
  ): Promise<number> {
    return new Promise(async (resolve, reject) => {
      const sourceFileSession = new FileSessionService(fileExtension); 
      await sourceFileSession.write(buffer);
      let ffmpegInterface = ffmpeg(sourceFileSession.filePath);
      ffmpegInterface.ffprobe(async (err: any, metadata: any) => {
        await sourceFileSession.delete();
        if (err) {
          reject(err);
          return;
        }
        resolve(parseInt(`${(metadata.format.duration || 0) * 1000}`, 10));
      });
    });
  }

  private async loudnormMeasurement(
    audioBuffer: Buffer,
    integratedLoudnessTarget: number,
    loudnessRange: number,
    truePeak: number,
  ): Promise<FfmpegLoudnormMeasurementResult> {
    const tmpFilePath = join(tmpdir(), `${uuidv4()}.mp3`);
    try {
      await writeFile(tmpFilePath, audioBuffer);
      return new Promise((resolve, reject) => {
        try {
          ffmpeg(tmpFilePath)
            .addOption(
              `-filter:af loudnorm=I=${integratedLoudnessTarget}:TP=${truePeak}:LRA=${loudnessRange}:print_format=json`,
            )
            .outputFormat('null')
            .output('-')
            // .on("start", console.log)
            .on('end', (err: any, output: any) => {
              if (err) {
                reject(err);
                return;
              }
              if (!output) {
                reject(new Error('could receive output from ffmpeg'));
                return;
              }
              const parts = output.split(/\[Parsed_loudnorm_0 @ \w+\]/gm);
              const loudnorm = parts.pop();

              if (!loudnorm) {
                reject(new Error('could find parsed_loudnorm'));
                return;
              }
              resolve(JSON.parse(loudnorm) as FfmpegLoudnormMeasurementResult);
            })
            .run();
          // return readFile(outputFilePath);
        } catch (err) {
          reject(err);
        }
      });
    } finally {
      // unlink(tmpFilePath);
    }
  }

  public async normalizeLoudnorm(
    audioBuffer: Buffer,
    integratedLoudnessTarget: number = -16,
    loudnessRange: number = 11,
    truePeak: number = -1.5,
  ): Promise<Buffer> {
    const measurement = await this.loudnormMeasurement(
      audioBuffer,
      integratedLoudnessTarget,
      loudnessRange,
      truePeak,
    );
    return this.normloudTransform(
      audioBuffer,
      integratedLoudnessTarget,
      loudnessRange,
      truePeak,
      measurement,
    );
  }

  private async normloudTransform(
    audioBuffer: Buffer,
    integratedLoudnessTarget: number = -16,
    loudnessRange: number = 11,
    truePeak: number = -1.5,
    measurement: FfmpegLoudnormMeasurementResult,
  ): Promise<Buffer> {
    const tmpFilePath = join(tmpdir(), `${uuidv4()}.mp3`);
    const outputFilePath = join(tmpdir(), `${uuidv4()}.mp3`);
    try {
      await writeFile(tmpFilePath, audioBuffer);
      return new Promise(async (resolve, reject) => {
        try {
          ffmpeg(tmpFilePath)
            .addOption(
              `-af loudnorm=I=${integratedLoudnessTarget}:LRA=${loudnessRange}:TP=${truePeak}:measured_I=${measurement.output_i}:measured_LRA=${measurement.output_lra}:measured_TP=${measurement.output_tp}:linear=true:print_format=summary`,
            )
            .output(outputFilePath)
            .once('end', async (err: any) => {
              if (err) {
                reject(err);
                return;
              }
              const outputBuffer = await readFile(outputFilePath);
              await unlink(outputFilePath);
              resolve(outputBuffer);
            })
            .run();
        } catch (err) {
          reject(err);
        }
      });
    } finally {
      // await unlink(tmpFilePath);
    }
  }
}
