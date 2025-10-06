// ============================================================================
// RUTA: src/application/services/TradePanelStore.ts
// ============================================================================

const store = new Map<string, string>();

export const tradePanelStore = {
  get(channelId: string): string | undefined {
    return store.get(channelId);
  },
  set(channelId: string, messageId: string): void {
    store.set(channelId, messageId);
  },
  delete(channelId: string): void {
    store.delete(channelId);
  },
};
