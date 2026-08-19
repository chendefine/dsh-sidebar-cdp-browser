/** Regression tests for the v0.1.3 "cannot type" bug: the capture-phase
 *  window listeners must fire regardless of which element holds focus, and
 *  must stay silent when the user is typing into another DSH surface. */
import { describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { attachKeyboardBridge } from '../src/client/input-bridge.ts'

function setup(active: boolean) {
  const dom = new JSDOM('<!doctype html><html><body><textarea></textarea><input><div id="chat" contenteditable="true"></div></body></html>')
  const win = dom.window as unknown as {
    KeyboardEvent: typeof KeyboardEvent
    addEventListener: typeof window.addEventListener
    removeEventListener: typeof window.removeEventListener
  }
  const globalWin = globalThis as unknown as { window: typeof win }
  const previous = globalWin.window
  globalWin.window = win

  const sink = dom.window.document.querySelector('textarea') as HTMLTextAreaElement
  const chat = dom.window.document.querySelector('#chat') as HTMLDivElement
  const input = dom.window.document.querySelector('input') as HTMLInputElement
  const keys: string[] = []
  const texts: string[] = []

  const dispose = attachKeyboardBridge({
    sink,
    enabled: () => active,
    sendKey: input => { keys.push(`${input.type}:${input.key ?? ''}`); return true },
    sendText: text => { texts.push(text); return true },
  })
  return { dom, win, globalWin, previous, sink, chat, input, keys, texts, dispose }
}

describe('capture-phase keyboard claim (v0.1.3 regression)', () => {
  it('delivers keys even though focus never reached the sink', () => {
    const ctx = setup(true)
    try {
      // focus is on body — NOT the sink. The window capture listener must still fire.
      const event = new ctx.win.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true })
      ctx.dom.window.document.body.dispatchEvent(event)
      expect(ctx.keys).toContain('keyDown:a')
    } finally {
      ctx.dispose()
      ctx.globalWin.window = ctx.previous
    }
  })

  it('stays silent while the user types into another DSH input', () => {
    const ctx = setup(true)
    try {
      // Realistic path: the event bubbles from the input up to window, where
      // the capture listener sees target === INPUT and stays silent.
      ctx.input.dispatchEvent(new ctx.win.KeyboardEvent('keydown', { key: 'x', code: 'KeyX', bubbles: true }))
      // Direct dispatch on window with a spoofed input target must also be
      // refused — the target check, not the dispatch path, is the gate.
      const bodyEvent = new ctx.win.KeyboardEvent('keydown', { key: 'y', code: 'KeyY', bubbles: true })
      Object.defineProperty(bodyEvent, 'target', { value: ctx.input })
      ctx.dom.window.dispatchEvent(bodyEvent)
      expect(ctx.keys.filter(k => k.includes(':x') || k.includes(':y'))).toEqual([])
    } finally {
      ctx.dispose()
      ctx.globalWin.window = ctx.previous
    }
  })

  it('stays silent while typing into a contenteditable chat composer', () => {
    const ctx = setup(true)
    try {
      // jsdom does not compute isContentEditable (needs layout); assert on the
      // attribute the real browser derives it from, and mirror the check the
      // bridge performs (real browsers: isContentEditable === true here).
      expect(ctx.chat.getAttribute('contenteditable')).toBe('true')
      Object.defineProperty(ctx.chat, 'isContentEditable', { value: true })
      const event = new ctx.win.KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', bubbles: true })
      Object.defineProperty(event, 'target', { value: ctx.chat })
      ctx.dom.window.dispatchEvent(event)
      expect(ctx.keys.filter(k => k.includes(':z'))).toEqual([])
    } finally {
      ctx.dispose()
      ctx.globalWin.window = ctx.previous
    }
  })

  it('releases all pressed keys on dispose (no stuck keys)', async () => {
    const ctx = setup(true)
    const { win, dom, keys, dispose, globalWin, previous } = ctx
    try {
      dom.window.document.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }))
      expect(keys).toContain('keyDown:a')
    } finally {
      dispose()
      globalWin.window = previous
    }
    await Promise.resolve()
    expect(keys).toContain('keyUp:a')
  })

  it('is fully inert when the claim is inactive (enabled() false)', () => {
    const ctx = setup(false)
    try {
      ctx.dom.window.document.body.dispatchEvent(new ctx.win.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }))
      expect(ctx.keys).toEqual([])
    } finally {
      ctx.dispose()
      ctx.globalWin.window = ctx.previous
    }
  })
})
