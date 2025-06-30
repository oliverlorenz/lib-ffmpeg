# lib-ffmpeg

A small TypeScript library that wraps the [`fluent-ffmpeg`](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) API and some ffmpeg binaries to make common video and audio tasks simple.

## Features

- Merge multiple video files
- Replace the audio track of a video
- Mix an additional audio track into an existing video
- Cut segments from a video buffer
- Determine video duration from a buffer
- Normalize audio using the `loudnorm` filter
- Extract a single frame from a video
- Apply a watermark over the entire video

## Installation

```bash
npm install @oliverlorenz/lib-ffmpeg
```

This package bundles ffmpeg and ffprobe so no global installation is required.

## Usage

```ts
import { FfmpegService } from '@oliverlorenz/lib-ffmpeg';
import { writeFile } from 'node:fs/promises';

const ffmpeg = new FfmpegService();

// Merge videos
const { buffer } = await ffmpeg.merge(['intro.mp4', 'main.mp4']);
await writeFile('merged.mp4', buffer);

// Replace the audio of a video
const output = await ffmpeg.replaceAudioIntoVideo('video.mp4', 'audio.mp3');
await writeFile('new-audio.mp4', output);
```

Additional types such as `VideoRenderResult` are exported for convenience.

## Development

- **Build**: `npm run build`
- **Lint**: `npm run lint:eslint && npm run lint:prettier && npm run lint:types`
- **Test**: `npm test`

## License

This project is licensed under the [MIT](LICENSE) license.
