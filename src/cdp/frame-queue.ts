export interface LatestFrameQueueOptions<T> {
  onDrop?: (frame: T) => void | Promise<void>;
}

/**
 * A single-slot asynchronous queue. A producer never waits; a newer frame
 * replaces the queued frame, which bounds latency and memory under backpressure.
 */
export class LatestFrameQueue<T> implements AsyncIterable<T> {
  readonly #onDrop?: (frame: T) => void | Promise<void>;
  #latest: T | undefined;
  #waiting: ((result: IteratorResult<T>) => void) | undefined;
  #closed = false;

  constructor(options: LatestFrameQueueOptions<T> = {}) {
    this.#onDrop = options.onDrop;
  }

  get closed(): boolean { return this.#closed; }
  get hasFrame(): boolean { return this.#latest !== undefined; }

  push(frame: T): boolean {
    if (this.#closed) {
      void this.#drop(frame);
      return false;
    }
    if (this.#waiting) {
      const resolve = this.#waiting;
      this.#waiting = undefined;
      resolve({ value: frame, done: false });
      return true;
    }
    if (this.#latest !== undefined) void this.#drop(this.#latest);
    this.#latest = frame;
    return true;
  }

  take(): Promise<IteratorResult<T>> {
    if (this.#latest !== undefined) {
      const value = this.#latest;
      this.#latest = undefined;
      return Promise.resolve({ value, done: false });
    }
    if (this.#closed) return Promise.resolve({ value: undefined, done: true });
    if (this.#waiting) return Promise.reject(new Error('Only one LatestFrameQueue consumer is supported'));
    return new Promise((resolve) => { this.#waiting = resolve; });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#latest !== undefined) {
      void this.#drop(this.#latest);
      this.#latest = undefined;
    }
    const resolve = this.#waiting;
    this.#waiting = undefined;
    resolve?.({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return { next: () => this.take(), return: async () => { this.close(); return { value: undefined, done: true }; } };
  }

  async #drop(frame: T): Promise<void> {
    try { await this.#onDrop?.(frame); } catch { /* dropping must never block producers */ }
  }
}
