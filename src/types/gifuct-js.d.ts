declare module 'gifuct-js' {
  interface GifRect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  }

  interface GifFrame {
    readonly delay?: number;
    readonly disposalType?: number;
    readonly dims: GifRect;
    readonly patch: Uint8ClampedArray;
  }

  interface GifLsd {
    readonly width: number;
    readonly height: number;
  }

  interface ParsedGif {
    readonly lsd: GifLsd;
  }

  export function parseGIF(buffer: ArrayBuffer | Uint8Array | Buffer): ParsedGif;

  export function decompressFrames(gif: ParsedGif, buildImagePatches: true): GifFrame[];
}
