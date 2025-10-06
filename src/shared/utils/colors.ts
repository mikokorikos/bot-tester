// ============================================================================
// RUTA: src/shared/utils/colors.ts
// ============================================================================

/**
 * Normaliza un color hexadecimal a formato mayúsculas
 * @param value Color hexadecimal en formato #RRGGBB
 * @returns Color normalizado en mayúsculas
 */
export const normalizeHex = (value: string): string => value.toUpperCase();

/**
 * Limita un valor numérico entre un mínimo y máximo
 * @param value Valor a limitar
 * @param min Valor mínimo
 * @param max Valor máximo
 * @returns Valor limitado entre min y max
 */
const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

/**
 * Convierte un color hexadecimal a componentes RGB
 * @param value Color hexadecimal en formato #RRGGBB
 * @returns Array con componentes [r, g, b]
 */
const hexToRgb = (value: string): [number, number, number] => {
  const hex = value.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
};

/**
 * Añade transparencia a un color hexadecimal
 * @param hex Color hexadecimal en formato #RRGGBB
 * @param alpha Valor de transparencia entre 0 y 1
 * @returns String en formato rgba(r, g, b, a)
 */
export const addAlphaToHex = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const safeAlpha = clamp(alpha, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha.toFixed(2)})`;
};