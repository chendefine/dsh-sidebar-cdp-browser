import { describe, expect, it, vi } from 'vitest'
import { LatestFrameQueue } from '../src/cdp/frame-queue.ts'

describe('LatestFrameQueue', () => {
  it('drops an older queued frame and keeps the latest', async () => {
    const onDrop = vi.fn()
    const queue = new LatestFrameQueue<number>({ onDrop })
    queue.push(1)
    queue.push(2)
    await Promise.resolve()
    expect(onDrop).toHaveBeenCalledWith(1)
    await expect(queue.take()).resolves.toEqual({ value: 2, done: false })
  })

  it('delivers directly to one waiting consumer', async () => {
    const queue = new LatestFrameQueue<string>()
    const pending = queue.take()
    queue.push('frame')
    await expect(pending).resolves.toEqual({ value: 'frame', done: false })
  })

  it('closes a waiting consumer and rejects a second simultaneous consumer', async () => {
    const queue = new LatestFrameQueue<string>()
    const pending = queue.take()
    await expect(queue.take()).rejects.toThrow(/one .* consumer/i)
    queue.close()
    await expect(pending).resolves.toEqual({ value: undefined, done: true })
  })
})
