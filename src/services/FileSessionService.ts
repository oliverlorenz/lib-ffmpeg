import { existsSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
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
		return Buffer.from(this.filePath);
	}

	public async waitForRead(): Promise<Buffer> {
		let count = 0;
		while (!existsSync(this.filePath)) {
			await new Promise((resolve) => {
				count++;
				setTimeout(resolve, 500);
			});
			if (count > 30) {
				throw new Error('File not found');
			}
		}
		return this.read();
	}

	public async delete(): Promise<void> {
		if (existsSync(this.filePath)) {
			await unlink(this.filePath);
		}
	}
}
