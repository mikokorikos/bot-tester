// ============================================================================
// RUTA: src/shared/utils/dm-queue.ts
// ============================================================================

import type { User } from 'discord.js';

interface QueueItem {
  readonly user: User;
  readonly payload: Parameters<User['send']>[0];
  readonly resolve: () => void;
  readonly reject: (reason?: unknown) => void;
}

const DEFAULT_DELAY_MS = 1500;

export class DirectMessageQueue {
  private readonly queue: QueueItem[] = [];

  private processing = false;

  public constructor(private readonly delayMs: number = DEFAULT_DELAY_MS) {}

  public async enqueue(user: User, payload: Parameters<User['send']>[0]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ user, payload, resolve, reject });
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) {
        continue;
      }

      try {
        await item.user.send(item.payload);
        item.resolve();
      } catch (error) {
        item.reject(error);
      }

      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    this.processing = false;
  }
}

export const dmQueue = new DirectMessageQueue();
