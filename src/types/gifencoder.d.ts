declare module 'gifencoder' {
  import type { EventEmitter } from 'node:events';

  interface GIFEncoderOptions {
    highWaterMark?: number;
  }

  class GIFEncoder extends EventEmitter {
    constructor(width: number, height: number, options?: GIFEncoderOptions);

    public createReadStream(): NodeJS.ReadableStream;
    public start(): void;
    public setRepeat(repeat: number): void;
    public setDelay(ms: number): void;
    public setQuality(quality: number): void;
    public addFrame(imageData: unknown): void;
    public finish(): void;

    public readonly out: {
      getData(): Uint8Array;
    };
  }

  export { GIFEncoder, GIFEncoderOptions };
  export = GIFEncoder;
}
