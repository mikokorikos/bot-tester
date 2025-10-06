declare module '@napi-rs/canvas' {
  import type { Buffer } from 'node:buffer';

  export type CanvasTextAlign = 'start' | 'end' | 'left' | 'right' | 'center';
  export type CanvasTextBaseline =
    | 'top'
    | 'hanging'
    | 'middle'
    | 'alphabetic'
    | 'ideographic'
    | 'bottom';
  export type GlobalCompositeOperation =
    | 'source-over'
    | 'source-in'
    | 'source-out'
    | 'source-atop'
    | 'destination-over'
    | 'destination-in'
    | 'destination-out'
    | 'destination-atop'
    | 'lighter'
    | 'copy'
    | 'xor'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'color-dodge'
    | 'color-burn'
    | 'hard-light'
    | 'soft-light'
    | 'difference'
    | 'exclusion'
    | 'hue'
    | 'saturation'
    | 'color'
    | 'luminosity';

  export type CanvasImageSource =
    | Buffer
    | { width: number; height: number }
    | { data: Uint8ClampedArray; width: number; height: number }
    | Canvas;

  export type CanvasPattern = unknown;

  export interface ImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
  }

  export interface CanvasGradient {
    addColorStop(offset: number, color: string): void;
  }

  export interface SKRSContext2D {
    readonly canvas: { width: number; height: number };
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    shadowColor: string;
    shadowBlur: number;
    lineWidth: number;
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    globalCompositeOperation: GlobalCompositeOperation;
    save(): void;
    restore(): void;
    scale(x: number, y: number): void;
    translate(x: number, y: number): void;
    rotate(angle: number): void;
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
    fillRect(x: number, y: number, width: number, height: number): void;
    clearRect(x: number, y: number, width: number, height: number): void;
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    resetTransform(): void;
    stroke(): void;
    fill(): void;
    clip(): void;
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
    createPattern(
      image: CanvasImageSource,
      repetition: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat',
    ): CanvasPattern | null;
    drawImage(
      image: CanvasImageSource,
      dx: number,
      dy: number,
      dw?: number,
      dh?: number,
    ): void;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
    measureText(text: string): { width: number };
    createImageData(width: number, height: number): ImageData;
    putImageData(data: ImageData, dx: number, dy: number): void;
  }

  export interface Canvas {
    getContext(type: '2d'): SKRSContext2D;
    toBuffer(mimeType?: string): Buffer;
  }

  export function createCanvas(width: number, height: number): Canvas;
  export function loadImage(source: Buffer | string | URL): Promise<CanvasImageSource>;
}
