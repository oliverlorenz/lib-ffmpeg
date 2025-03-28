import { Readable } from "stream";

export function bufferToStream(buffer: Buffer): Readable {
	// Create a readable stream from the buffer
	const stream = new Readable();
	stream.push(buffer);
	stream.push(null); // Indicate the end of the stream

	return stream;
}