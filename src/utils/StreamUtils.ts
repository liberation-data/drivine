import { Readable, Writable } from 'stream';

export class StreamUtils {
    static async untilClosed(stream: Readable | Writable): Promise<void> {
        return new Promise((resolve, reject) => {
            stream.on('close', () => {
                resolve();
            });
            stream.on('error', (e) => {
                reject(e);
            });
        });
    }
}
