/** jsdom-level check of the keyboard sink mechanics: the exact DOM shape
 *  LiveCanvas renders (wrap > canvas + hidden textarea with
 *  pointer-events:none / tabIndex:-1), driven with real DOM events — the
 *  layer the v0.1.0 focus bug lived in. */
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

function buildDom() {
  const dom = new JSDOM('<!doctype html><html><body><div class="wrap"></div></body></html>')
  const doc = dom.window.document
  const view = dom.window as unknown as {
    PointerEvent: typeof PointerEvent
    KeyboardEvent: typeof KeyboardEvent
  }
  const wrap = doc.querySelector('.wrap') as HTMLDivElement
  const canvas = doc.createElement('canvas') as HTMLCanvasElement
  canvas.tabIndex = -1
  const sink = doc.createElement('textarea') as HTMLTextAreaElement
  sink.tabIndex = -1
  sink.style.pointerEvents = 'none'
  wrap.append(canvas, sink)
  const active = () => doc.activeElement
  return { doc, view, wrap, canvas, sink, active }
}

describe('keyboard sink focus mechanics (jsdom)', () => {
  it('programmatic focus on the hidden sink moves document.activeElement to it', () => {
    const { sink, active } = buildDom()
    expect(active()).toBe(sink.ownerDocument.body)
    sink.focus({ preventScroll: true } as FocusOptions)
    expect(active()).toBe(sink)
  })

  it('focus survives when the canvas is also focusable (the click-focus race)', () => {
    const { canvas, sink, active, view } = buildDom()
    // the failing sequence: canvas receives pointerdown (would take focus by
    // default in a real browser), then the handler focuses the sink — the sink
    // must end up active, not the canvas.
    canvas.dispatchEvent(new view.PointerEvent('pointerdown', { bubbles: true }))
    sink.focus({ preventScroll: true } as FocusOptions)
    expect(active()).toBe(sink)
    expect(active()).not.toBe(canvas)
  })

  it('keydown on the focused sink reaches the sink listener', () => {
    const { sink, view } = buildDom()
    const keys: string[] = []
    sink.addEventListener('keydown', (event) => { keys.push(event.key); event.preventDefault() })
    sink.focus({ preventScroll: true } as FocusOptions)
    sink.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }))
    expect(keys).toEqual(['a'])
  })
})
