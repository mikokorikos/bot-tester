declare module '@ffmpeg/ffmpeg' {
  export interface FFmpegOptions {
    readonly corePath?: string;
    readonly log?: boolean;
  }

  export interface FFmpeg {
    load(): Promise<void>;
    FS(operation: 'writeFile', path: string, data: Uint8Array): void;
    FS(operation: 'readFile', path: string): Uint8Array;
    FS(operation: 'unlink', path: string): void;
    run(...args: string[]): Promise<void>;
  }

  export function createFFmpeg(options?: FFmpegOptions): FFmpeg;
  export function fetchFile(source: string | ArrayBuffer | Uint8Array): Promise<Uint8Array>;
}
