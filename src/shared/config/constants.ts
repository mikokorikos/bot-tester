// ============================================================================
// RUTA: src/shared/config/constants.ts
// ============================================================================

import { PermissionFlagsBits, type PermissionResolvable } from 'discord.js';

export const COLORS = Object.freeze({
  primary: 0x6f4dfb,
  success: 0x1ec8a5,
  warning: 0xffc857,
  danger: 0xff6b81,
  info: 0x5a6ef5,
  accent: 0x8b7cf6,
  neutral: 0x2a2d43,
  surface: 0x1f2033,
});

export const EMBED_LIMITS = Object.freeze({
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  maxFields: 25,
});

export const MODAL_LIMITS = Object.freeze({
  textInput: 1024,
  title: 45,
  customId: 100,
  maxComponents: 5,
});

export const COOLDOWNS = Object.freeze({
  ping: 5_000,
  help: 10_000,
  middlemanRequest: 60_000,
  generalTicket: 60_000,
  warnCommand: 15_000,
});

export const PERMISSIONS = Object.freeze({
  staff: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ModerateMembers] as const,
  admin: [PermissionFlagsBits.Administrator] as const,
});

export type CommandCooldownKey = keyof typeof COOLDOWNS;
export type PermissionGroupKey = keyof typeof PERMISSIONS;
export type PermissionGroup = readonly PermissionResolvable[];
