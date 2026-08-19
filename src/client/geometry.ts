import type { FrameMetadata } from './cdp-api.ts'

export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
export interface DrawRect extends Point, Size { scale: number }

export function frameSize(metadata: FrameMetadata | undefined, fallback: Size): Size {
  const width = positive(metadata?.deviceWidth) ?? fallback.width
  const height = positive(metadata?.deviceHeight) ?? fallback.height
  return { width, height }
}

export function containRect(container: Size, content: Size): DrawRect {
  if (container.width <= 0 || container.height <= 0 || content.width <= 0 || content.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0, scale: 1 }
  }
  const scale = Math.min(container.width / content.width, container.height / content.height)
  const width = content.width * scale
  const height = content.height * scale
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height, scale }
}

export function clientToFrame(client: Point, bounds: DOMRect, draw: DrawRect, frame: Size): Point | null {
  const x = client.x - bounds.left - draw.x
  const y = client.y - bounds.top - draw.y
  if (x < 0 || y < 0 || x > draw.width || y > draw.height || draw.width === 0 || draw.height === 0) return null
  return {
    x: clamp(x / draw.width * frame.width, 0, frame.width),
    y: clamp(y / draw.height * frame.height, 0, frame.height),
  }
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
