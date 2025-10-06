// ============================================================================
// RUTA: src/shared/utils/text.ts
// ============================================================================

const DIACRITIC_REGEX = /[\u0300-\u036f]/g;

export const stripDiacritics = (value: string): string =>
  value.normalize('NFD').replace(DIACRITIC_REGEX, '');

export const stripDiacriticsDeep = <T>(value: T): T => {
  if (typeof value === 'string') {
    return stripDiacritics(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripDiacriticsDeep(item)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    if (value instanceof Date || value instanceof RegExp || value instanceof Map || value instanceof Set) {
      return value;
    }

    if (value instanceof Error) {
      value.message = stripDiacritics(value.message);
      if (typeof value.stack === 'string') {
        value.stack = stripDiacritics(value.stack);
      }

      return value;
    }

    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      stripDiacriticsDeep(entryValue),
    ]);

    return Object.fromEntries(entries) as T;
  }

  return value;
};

