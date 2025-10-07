const DEFAULT_PRECISION = 2;

export function roundToPrecision(value: number, precision = DEFAULT_PRECISION): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
