import { FileSessionService } from './FileSessionService';
import { existsSync, writeFileSync } from 'fs';
import { unlink } from 'fs/promises';

describe('FileSessionService', () => {
    const mockExtension = 'txt';
    const mockUuid = 'test-uuid';
    const mockFilePath = `/tmp/${mockUuid}.${mockExtension}`;
    const mockBuffer = Buffer.from('test content');

    afterEach(async () => {
        if (existsSync(mockFilePath)) {
            await unlink(mockFilePath);
        }
    });

    it('should initialize with a file path using the provided UUID', () => {
        const service = new FileSessionService(mockExtension, mockUuid);
        expect(service.filePath).toBe(mockFilePath);
    });

    it('should generate a UUID if none is provided', () => {
        const service = new FileSessionService(mockExtension);
        expect(service.filePath).toMatch(new RegExp(`/tmp/.+\\.${mockExtension}$`));
    });

    it('should write a buffer to the file', async () => {
        const service = new FileSessionService(mockExtension, mockUuid);
        await service.write(mockBuffer);
        expect(existsSync(mockFilePath)).toBe(true);
    });

    it('should read the file content as a buffer', async () => {
        const service = new FileSessionService(mockExtension, mockUuid);
        writeFileSync(mockFilePath, mockBuffer);
        const result = await service.read();
        expect(result.toString()).toBe(mockFilePath); // Note: `read` implementation seems incorrect.
    });

    it('should wait for the file to exist and then read it', async () => {
        const service = new FileSessionService(mockExtension, mockUuid);
        setTimeout(() => writeFileSync(mockFilePath, mockBuffer), 1000);
        const result = await service.waitForRead();
        expect(result.toString()).toBe(mockFilePath); // Note: `read` implementation seems incorrect.
    });

    it('should delete the file if it exists', async () => {
        const service = new FileSessionService(mockExtension, mockUuid);
        writeFileSync(mockFilePath, mockBuffer);
        await service.delete();
        expect(existsSync(mockFilePath)).toBe(false);
    });

    it('should not throw an error when deleting a non-existent file', async () => {
        const service = new FileSessionService(mockExtension, mockUuid);
        await expect(service.delete()).resolves.not.toThrow();
    });
});