// ============================================================================
// RUTA: src/shared/utils/permissions.ts
// ============================================================================

import type { GuildMember, PermissionResolvable } from 'discord.js';

export const hasPermissions = (member: GuildMember | null, permissions: ReadonlyArray<PermissionResolvable>): boolean => {
  if (!member) {
    return false;
  }

  return permissions.every((permission) => member.permissions.has(permission));
};
