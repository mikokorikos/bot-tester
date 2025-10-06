// ============================================================================
// RUTA: src/shared/config/branding.ts
// ============================================================================

import { resolve } from 'node:path';

interface DedosBrandConfig {
  readonly color: number;
  readonly accentColor: number;
  readonly author: {
    readonly name: string;
    readonly iconURL: string;
  };
  readonly footer: {
    readonly text: string;
    readonly iconURL?: string;
  };
  readonly thumbnailURL: string;
  readonly imageURL: string;
}

const gifEnv = process.env['DEDOS_GIF_URL']?.trim();
const DEFAULT_GIF_URL =
  gifEnv && gifEnv.startsWith('http')
    ? gifEnv
    : 'https://raw.githubusercontent.com/mikokorikos/dedos-shop-utilities/codex/fix-errors-in-middleman-logic/dedosgif.gif';

const brandIconEnv = process.env['DEDOS_BRAND_ICON_URL']?.trim();
const DEFAULT_ICON_URL =
  'https://cdn.discordapp.com/attachments/1412699909949358151/1417020355389952031/8acfd3c22d8286c858abb3e9b4bc97cc.jpg';

export const DEDOS_BRAND: DedosBrandConfig = Object.freeze({
  color: 0x6f4dfb,
  accentColor: 0x8b7cf6,
  author: {
    name: 'Dedos Shop • Sistema de Middleman',
    iconURL:
      brandIconEnv && brandIconEnv.startsWith('http') ? brandIconEnv : DEFAULT_ICON_URL,
  },
  footer: {
    text: 'Dedos Shop • Seguridad en cada trade',
    iconURL: brandIconEnv && brandIconEnv.startsWith('http') ? brandIconEnv : DEFAULT_ICON_URL,
  },
  thumbnailURL: brandIconEnv && brandIconEnv.startsWith('http') ? brandIconEnv : DEFAULT_ICON_URL,
  imageURL: DEFAULT_GIF_URL,
});

export const resolveDedosAsset = (relativePath: string): string => resolve(process.cwd(), relativePath);
