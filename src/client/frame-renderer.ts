import type { FrameMetadata } from './cdp-api.ts'
import { containRect, frameSize, type DrawRect, type Size } from './geometry.ts'

export interface RenderedFrame {
  targetKey: string
  sequence: number
  blob: Blob
  metadata?: FrameMetadata
  mimeType?: string
  receivedAt: number
}

export interface FrameRenderer {
  draw(canvas: HTMLCanvasElement, frame: RenderedFrame): Promise<DrawRect | null>
  dispose(): void
}

export function createFrameRenderer(): FrameRenderer {
  let generation = 0
  let bitmap: ImageBitmap | null = null

  return {
    async draw(canvas, frame) {
      const request = ++generation
      const next = await createImageBitmap(frame.blob)
      if (request !== generation) {
        next.close()
        return null
      }
      bitmap?.close()
      bitmap = next
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) return null
      const ratio = window.devicePixelRatio || 1
      const cssSize: Size = { width: canvas.clientWidth, height: canvas.clientHeight }
      const wantedWidth = Math.max(1, Math.round(cssSize.width * ratio))
      const wantedHeight = Math.max(1, Math.round(cssSize.height * ratio))
      if (canvas.width !== wantedWidth || canvas.height !== wantedHeight) {
        canvas.width = wantedWidth
        canvas.height = wantedHeight
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.fillStyle = getComputedStyle(canvas).getPropertyValue('--dsw-alias-bg-base').trim() || 'rgb(0 0 0)'
      context.fillRect(0, 0, cssSize.width, cssSize.height)
      const content = frameSize(frame.metadata, { width: next.width, height: next.height })
      const draw = containRect(cssSize, content)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(next, draw.x, draw.y, draw.width, draw.height)
      return draw
    },
    dispose() {
      generation++
      bitmap?.close()
      bitmap = null
    },
  }
}
