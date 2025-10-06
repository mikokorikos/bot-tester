import { parentPort } from 'node:worker_threads';

import { createCanvas } from '@napi-rs/canvas';

interface ProcessFrameMessage {
  readonly type: 'processFrame';
  readonly frameIndex: number;
  readonly width: number;
  readonly height: number;
  readonly bitmap: Uint8ClampedArray;
  readonly operations: FrameOperation[];
}

interface ShutdownMessage {
  readonly type: 'shutdown';
}

type WorkerMessage = ProcessFrameMessage | ShutdownMessage;

interface FrameOperationBase {
  readonly kind: string;
}

interface BlurOperation extends FrameOperationBase {
  readonly kind: 'blur';
  readonly radius: number;
}

interface SaturateOperation extends FrameOperationBase {
  readonly kind: 'saturate';
  readonly factor: number;
}

interface OverlayOperation extends FrameOperationBase {
  readonly kind: 'overlay';
  readonly color: [number, number, number, number];
}

export type FrameOperation = BlurOperation | SaturateOperation | OverlayOperation;

if (!parentPort) {
  throw new Error('Frame processor worker must be spawned as a worker thread');
}

parentPort.on('message', async (message: WorkerMessage) => {
  if (message.type === 'shutdown') {
    parentPort?.close();
    return;
  }

  const { width, height, bitmap, frameIndex, operations } = message;
  const sourceData = bitmap instanceof Uint8Array ? new Uint8ClampedArray(bitmap) : bitmap;
  const processed = applyOperations(sourceData, width, height, operations);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(processed);
  ctx.putImageData(imageData, 0, 0);

  const png = canvas.toBuffer('image/png');
  parentPort?.postMessage(
    {
      type: 'processedFrame',
      frameIndex,
      width,
      height,
      png,
    },
    [png.buffer],
  );
});

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const applyOperations = (
  source: Uint8ClampedArray,
  width: number,
  height: number,
  operations: FrameOperation[],
): Uint8ClampedArray => {
  let data = new Uint8ClampedArray(source);

  for (const operation of operations) {
    switch (operation.kind) {
      case 'blur': {
        data = applyBoxBlur(data, width, height, operation.radius);
        break;
      }
      case 'saturate': {
        data = applySaturation(data, operation.factor);
        break;
      }
      case 'overlay': {
        data = applyOverlay(data, operation.color);
        break;
      }
      default: {
        const exhaustive: never = operation;
        throw new Error(`Unsupported frame operation ${(exhaustive as FrameOperationBase).kind}`);
      }
    }
  }

  return data;
};

const applySaturation = (data: Uint8ClampedArray, factor: number): Uint8ClampedArray => {
  const result = new Uint8ClampedArray(data.length);

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const a = data[index + 3] ?? 255;
    const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
    result[index] = clamp(gray + factor * (r - gray));
    result[index + 1] = clamp(gray + factor * (g - gray));
    result[index + 2] = clamp(gray + factor * (b - gray));
    result[index + 3] = a;
  }

  return result;
};

const applyOverlay = (data: Uint8ClampedArray, color: [number, number, number, number]): Uint8ClampedArray => {
  const result = new Uint8ClampedArray(data.length);
  const [or, og, ob, oa] = color;
  const alpha = (oa ?? 255) / 255;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const a = data[index + 3] ?? 255;

    result[index] = clamp(r * (1 - alpha) + or * alpha);
    result[index + 1] = clamp(g * (1 - alpha) + og * alpha);
    result[index + 2] = clamp(b * (1 - alpha) + ob * alpha);
    result[index + 3] = a;
  }

  return result;
};

const applyBoxBlur = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray => {
  if (radius <= 0) {
    return new Uint8ClampedArray(data);
  }

  const result = new Uint8ClampedArray(data.length);
  const kernelSize = radius * 2 + 1;
  const kernelArea = kernelSize * kernelSize;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;

      for (let ky = -radius; ky <= radius; ky += 1) {
        const sampleY = clampIndex(y + ky, height);
        for (let kx = -radius; kx <= radius; kx += 1) {
          const sampleX = clampIndex(x + kx, width);
          const idx = (sampleY * width + sampleX) * 4;
          sumR += data[idx] ?? 0;
          sumG += data[idx + 1] ?? 0;
          sumB += data[idx + 2] ?? 0;
          sumA += data[idx + 3] ?? 0;
        }
      }

      const targetIndex = (y * width + x) * 4;
      result[targetIndex] = clamp(sumR / kernelArea);
      result[targetIndex + 1] = clamp(sumG / kernelArea);
      result[targetIndex + 2] = clamp(sumB / kernelArea);
      result[targetIndex + 3] = clamp(sumA / kernelArea);
    }
  }

  return result;
};

const clampIndex = (value: number, max: number): number => {
  if (value < 0) {
    return 0;
  }
  if (value >= max) {
    return max - 1;
  }
  return value;
};
