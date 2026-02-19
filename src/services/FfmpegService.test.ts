import { writeFileSync, existsSync } from 'fs';
import { FfmpegService } from './FfmpegService';
import { FileSessionService } from './FileSessionService';
import fs, { readFile } from 'fs/promises';
import path from 'path';

describe('FfmpegService', () => {
  const assetDir = path.join(__dirname, '../../__tests__/assets');
  const videoPath = path.join(assetDir, 'sample.mp4');
  const audioPath = path.join(assetDir, 'silence.mp3');
  const audioLongPath = path.join(assetDir, 'silence_long.mp3');
  const pngPath = path.join(assetDir, 'dummy.png');
  const videoWithAudioPath = path.join(assetDir, 'sample_with_audio.mp4');
  let videoBuffer: Buffer;
  let audioBuffer: Buffer;
  let audioLongBuffer: Buffer;
  let pngBuffer: Buffer;
  let videoWithAudioBuffer: Buffer;

  beforeAll(async () => {
    // Ensure asset directory exists
    await fs.mkdir(assetDir, { recursive: true });

    // Helper: create silent mp3
    async function createSilentMp3(): Promise<void> {
      const { execSync } = await import('child_process');
      execSync(
        `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 -acodec libmp3lame "${audioPath}"`,
      );
    }
    // Helper: create long silent mp3
    async function createLongSilentMp3(): Promise<void> {
      const { execSync } = await import('child_process');
      execSync(
        `ffmpeg -f lavfi -i sine=frequency=440:duration=5 -q:a 9 -acodec libmp3lame "${audioLongPath}"`,
      );
    }
    // Helper: create video with audio
    async function createVideoWithAudio(): Promise<void> {
      const { execSync } = await import('child_process');
      execSync(
        `ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=25 -f lavfi -i anullsrc=r=44100:cl=mono -shortest -c:v libx264 -c:a aac -b:a 128k "${videoWithAudioPath}"`,
      );
    }
    // Helper: create dummy png
    async function createDummyPng(): Promise<void> {
      const { createCanvas } = await import('canvas');
      const canvas = createCanvas(32, 32);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 32, 32);
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(pngPath, buffer);
    }

    // Download video if not cached
    if (!existsSync(videoPath)) {
      const url =
        'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to download test video');
      const arrayBuffer = await res.arrayBuffer();
      videoBuffer = Buffer.from(arrayBuffer);
      await fs.writeFile(videoPath, videoBuffer);
    }
    if (!existsSync(audioPath)) await createSilentMp3();
    if (!existsSync(audioLongPath)) await createLongSilentMp3();
    if (!existsSync(videoWithAudioPath)) await createVideoWithAudio();
    if (!existsSync(pngPath)) await createDummyPng();

    // Load all buffers
    videoBuffer = await readFile(videoPath);
    audioBuffer = await readFile(audioPath);
    audioLongBuffer = await readFile(audioLongPath);
    pngBuffer = await readFile(pngPath);
    videoWithAudioBuffer = await readFile(videoWithAudioPath);
  });
  describe('cutOutSegments', () => {
    it('should cut out the specified segments from a video buffer', async () => {
      const service = new FfmpegService();
      const segments = [
        { startMs: 1000, endMs: 2000 },
        { startMs: 5000, endMs: 6000 },
      ];
      const resultBuffer = await service.cutOutSegments(videoBuffer, segments);
      writeFileSync(path.join(assetDir, '_result_cut_out.mp4'), resultBuffer);
      expect(resultBuffer).toBeInstanceOf(Buffer);
      expect(videoBuffer.length).toBeGreaterThan(resultBuffer.length);
    });
  });

  it('merge: should merge two video files', async () => {
    const service = new FfmpegService();
    const s1 = new FileSessionService('mp4');
    const s2 = new FileSessionService('mp4');
    await s1.write(videoBuffer);
    await s2.write(videoBuffer);
    const result = await service.merge([s1.filePath, s2.filePath]);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
    await s1.delete();
    await s2.delete();
  });

  it('replaceAudioIntoVideo: should replace audio in video', async () => {
    const service = new FfmpegService();
    const videoTmp = path.join(assetDir, 'tmp_video.mp4');
    const audioTmp = path.join(assetDir, 'tmp_audio.mp3');
    await fs.writeFile(videoTmp, videoWithAudioBuffer);
    await fs.writeFile(audioTmp, audioBuffer);
    const resultBuffer = await service.replaceAudioIntoVideo(videoTmp, audioTmp);
    expect(resultBuffer).toBeInstanceOf(Buffer);
    expect(resultBuffer.length).toBeGreaterThan(0);
  });

  it('mixinAudio: should mix audio into video', async () => {
    const service = new FfmpegService();
    const videoTmp = path.join(assetDir, 'tmp_video2.mp4');
    const audioTmp = path.join(assetDir, 'tmp_audio2.mp3');
    await fs.writeFile(videoTmp, videoWithAudioBuffer);
    await fs.writeFile(audioTmp, audioBuffer);
    const resultBuffer = await service.mixinAudio(videoTmp, audioTmp);
    expect(resultBuffer).toBeInstanceOf(Buffer);
    expect(resultBuffer.length).toBeGreaterThan(0);
  });

  it('cut: should cut a segment from video', async () => {
    const service = new FfmpegService();
    const resultBuffer = await service.cut(videoBuffer, 0, 1000);
    expect(resultBuffer).toBeInstanceOf(Buffer);
    expect(resultBuffer.length).toBeGreaterThan(0);
  });

  it('getDurationFromBuffer: should get duration of video', async () => {
    const service = new FfmpegService();
    const duration = await service.getDurationFromBuffer(videoBuffer);
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThan(0);
  });

  it('normalizeLoudnorm: should normalize audio loudness', async () => {
    const service = new FfmpegService();
    const resultBuffer = await service.normalizeLoudnorm(audioLongBuffer);
    expect(resultBuffer).toBeInstanceOf(Buffer);
    expect(resultBuffer.length).toBeGreaterThan(0);
  });

  it('extractFrame: should extract a frame as PNG', async () => {
    const service = new FfmpegService();
    const frameBuffer = await service.extractFrame(videoBuffer, 500);
    expect(frameBuffer).toBeInstanceOf(Buffer);
    expect(frameBuffer.length).toBeGreaterThan(0);
  });

  it('watermarkFullSize: should overlay a watermark', async () => {
    const service = new FfmpegService();
    const resultBuffer = await service.watermarkFullSize(videoBuffer, pngBuffer);
    expect(resultBuffer).toBeInstanceOf(Buffer);
    expect(resultBuffer.length).toBeGreaterThan(0);
  });

  describe('Fehlerfälle und Branches', () => {
    it('merge: should reject on invalid file', async () => {
      const service = new FfmpegService();
      await expect(service.merge(['notfound.mp4'])).rejects.toBeTruthy();
    });

    it('replaceAudioIntoVideo: should reject on invalid audio', async () => {
      const service = new FfmpegService();
      const videoTmp = path.join(assetDir, 'tmp_video_invalid.mp4');
      await fs.writeFile(videoTmp, videoWithAudioBuffer);
      await expect(service.replaceAudioIntoVideo(videoTmp, 'notfound.mp3')).rejects.toBeTruthy();
    });

    it('mixinAudio: should reject on invalid audio', async () => {
      const service = new FfmpegService();
      const videoTmp = path.join(assetDir, 'tmp_video_invalid2.mp4');
      await import('fs/promises').then((fs) => fs.writeFile(videoTmp, videoWithAudioBuffer));
      await expect(service.mixinAudio(videoTmp, 'notfound.mp3')).rejects.toBeTruthy();
    });

    it('cut: should reject on invalid buffer', async () => {
      const service = new FfmpegService();
      await expect(service.cut(Buffer.from('invalid'), 0, 1000)).rejects.toBeTruthy();
    });

    it('getDurationFromBuffer: should reject on invalid buffer', async () => {
      const service = new FfmpegService();
      await expect(service.getDurationFromBuffer(Buffer.from('invalid'))).rejects.toBeTruthy();
    });

    it('cutOutSegments: should reject on invalid buffer', async () => {
      const service = new FfmpegService();
      await expect(
        service.cutOutSegments(Buffer.from('invalid'), [{ startMs: 0, endMs: 1000 }]),
      ).rejects.toBeTruthy();
    });

    it('extractFrame: should reject on invalid buffer', async () => {
      const service = new FfmpegService();
      await expect(service.extractFrame(Buffer.from('invalid'), 500)).rejects.toBeTruthy();
    });

    it('watermarkFullSize: should reject on invalid buffer', async () => {
      const service = new FfmpegService();
      await expect(
        service.watermarkFullSize(Buffer.from('invalid'), pngBuffer),
      ).rejects.toBeTruthy();
      await expect(
        service.watermarkFullSize(videoBuffer, Buffer.from('invalid')),
      ).rejects.toBeTruthy();
    });

    it('normalizeLoudnorm: should reject on invalid buffer', async () => {
      const service = new FfmpegService();
      await expect(service.normalizeLoudnorm(Buffer.from('invalid'))).rejects.toBeTruthy();
    });
  });
});
