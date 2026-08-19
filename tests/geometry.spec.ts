import { describe, expect, it } from 'vitest'
import { clientToFrame, containRect } from '../src/client/geometry.ts'

describe('CDP live geometry', () => {
  it('maps a centered contain rectangle to viewport CSS pixels', () => {
    const draw = containRect({ width: 1000, height: 800 }, { width: 1600, height: 900 })
    expect(draw.width).toBe(1000)
    expect(draw.height).toBeCloseTo(562.5)
    expect(draw.y).toBeCloseTo(118.75)
    const bounds = { left: 10, top: 20 } as DOMRect
    expect(clientToFrame({ x: 510, y: 420 }, bounds, draw, { width: 1600, height: 900 })).toEqual({ x: 800, y: 450 })
  })

  it('rejects clicks in letterbox space', () => {
    const draw = containRect({ width: 1000, height: 800 }, { width: 1600, height: 900 })
    const bounds = { left: 0, top: 0 } as DOMRect
    expect(clientToFrame({ x: 500, y: 40 }, bounds, draw, { width: 1600, height: 900 })).toBeNull()
  })

  it('handles invalid dimensions without NaN coordinates', () => {
    expect(containRect({ width: 0, height: 100 }, { width: 1280, height: 720 })).toEqual({ x: 0, y: 0, width: 0, height: 0, scale: 1 })
  })
})
