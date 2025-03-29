import { existsSync, statSync } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

export class FileSessionService {
  public readonly filePath: string;

  constructor(
    extension: string,
    private readonly uuid?: string,
  ) {
    if (!uuid) {
      this.uuid = uuidv4();
    }

    this.filePath = `/tmp/${this.uuid}.${extension}`;
  }

  public async write(buffer: Buffer): Promise<void> {
    return writeFile(this.filePath, buffer);
  }

  public async read(): Promise<Buffer> {
    return readFile(this.filePath);
  }

  public async waitForRead(): Promise<Buffer> {
    let count = 0;
    let size = 0;
    let loop = true;

    while (loop) {
      const isExisting = existsSync(this.filePath);
      const currentSize = statSync(this.filePath).size;
      const isGrowing = currentSize > size;

      if (isExisting && !isGrowing) {
        loop = false;
      } else if (isExisting && isGrowing) {
        size = currentSize;
      } else {
        loop = false;
      }
      count++;
      if (count > 30) {
        throw new Error('File not found');
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }

    return this.read();
  }

  public async delete(): Promise<void> {
    if (existsSync(this.filePath)) {
      await unlink(this.filePath);
    }
  }
}
