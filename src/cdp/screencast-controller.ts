import type { ScreencastFrameEvent } from './browser-adapter.js';
import { LatestFrameQueue } from './frame-queue.js';
import { TargetController } from './target-controller.js';
import type { ScreencastFrame, ScreencastOptions, TargetKey } from './types.js';

interface ActiveScreencast {
  queue: LatestFrameQueue<ScreencastFrame>;
  handler: (payload: unknown) => void;
  sequence: number;
}

export class ScreencastController {
  readonly #targets: TargetController;
  readonly #active = new Map<TargetKey, ActiveScreencast>();

  constructor(targets: TargetController) { this.#targets = targets; }

  async start(targetKey: TargetKey, options: ScreencastOptions = {}): Promise<LatestFrameQueue<ScreencastFrame>> {
    const existing = this.#active.get(targetKey);
    if (existing) return existing.queue;
    const session = await this.#targets.attach(targetKey);
    const active: ActiveScreencast = {
      sequence: 0,
      queue: new LatestFrameQueue(),
      handler: () => undefined,
    };
    active.handler = (payload: unknown) => {
      const event = payload as ScreencastFrameEvent;
      // ACK immediately, independently of downstream frame consumption.
      void session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => undefined);
      active.queue.push({
        targetKey, sequence: active.sequence++, data: event.data,
        metadata: event.metadata, receivedAt: Date.now(),
      });
    };
    session.on('Page.screencastFrame', active.handler);
    this.#active.set(targetKey, active);
    try {
      await session.send('Page.enable');
      await session.send('Page.startScreencast', compact({
        format: options.format ?? 'jpeg', quality: options.quality ?? 80,
        maxWidth: options.maxWidth, maxHeight: options.maxHeight, everyNthFrame: options.everyNthFrame ?? 1,
      }));
      return active.queue;
    } catch (error) {
      session.off('Page.screencastFrame', active.handler);
      active.queue.close();
      this.#active.delete(targetKey);
      throw error;
    }
  }

  async stop(targetKey: TargetKey): Promise<void> {
    const active = this.#active.get(targetKey);
    if (!active) return;
    this.#active.delete(targetKey);
    active.queue.close();
    try {
      const session = await this.#targets.session(targetKey);
      session.off('Page.screencastFrame', active.handler);
      await session.send('Page.stopScreencast');
    } catch { /* a destroyed/detached target is already stopped */ }
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.#active.keys()].map((key) => this.stop(key)));
  }
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
