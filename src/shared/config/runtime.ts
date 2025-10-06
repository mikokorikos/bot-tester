// ============================================================================
// RUTA: src/shared/config/runtime.ts
// ============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RUNTIME_CONFIG_PATH = path.resolve(process.cwd(), 'config/runtime.json');

export interface RuntimeConfig {
  readonly reviewsChannelId: string | null;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  reviewsChannelId: null,
};

let cachedConfig: RuntimeConfig | null = null;

export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const raw = await readFile(RUNTIME_CONFIG_PATH, 'utf8');
    cachedConfig = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as RuntimeConfig) };
    return cachedConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await saveRuntimeConfig(DEFAULT_CONFIG);
      cachedConfig = DEFAULT_CONFIG;
      return DEFAULT_CONFIG;
    }

    throw error;
  }
};

export const saveRuntimeConfig = async (config: RuntimeConfig): Promise<void> => {
  cachedConfig = config;
  await writeFile(RUNTIME_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
};

export const updateRuntimeConfig = async (partial: Partial<RuntimeConfig>): Promise<RuntimeConfig> => {
  const current = await loadRuntimeConfig();
  const next = { ...current, ...partial };
  await saveRuntimeConfig(next);
  return next;
};
