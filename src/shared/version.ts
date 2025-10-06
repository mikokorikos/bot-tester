// ============================================================================
// RUTA: src/shared/version.ts
// ============================================================================

import packageJson from '../../package.json' assert { type: 'json' };

type PackageJson = {
  readonly version?: string;
};

const { version = '0.0.0' } = packageJson as PackageJson;
const startupTimestamp = new Date();

export const versionInfo = {
  version,
  startedAt: startupTimestamp,
  startedAtIso: startupTimestamp.toISOString(),
  reminder: 'Cada cambio documentado corresponde a una nueva versión del proyecto.',
} as const;
