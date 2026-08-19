import { describe, expect, it } from 'vitest'
import { mapKeyboardEvent, type KeyboardEventLike } from '../src/client/input-bridge.ts'
import { parseClientRequest } from '../src/cdp/protocol.ts'

const key = (event: Partial<KeyboardEventLike>): KeyboardEventLike => ({ key: '', code: '', repeat: false, ...event })

describe('keyboard event mapping', () => {
  it('maps a printable key with text and virtual-key code', () => {
    expect(mapKeyboardEvent(key({ key: 'a', code: 'KeyA' }), 'keyDown')).toEqual({
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      text: 'a',
      unmodifiedText: 'a',
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 0,
    })
  })

  it('keeps shifted characters as the shifted text', () => {
    const mapped = mapKeyboardEvent(key({ key: 'A', code: 'KeyA', shiftKey: true }), 'keyDown')
    expect(mapped.text).toBe('A')
    expect(mapped.modifiers).toBe(8)
  })

  it('suppresses text for Ctrl/Meta combos (shortcuts, not typing)', () => {
    const ctrl = mapKeyboardEvent(key({ key: 'r', code: 'KeyR', ctrlKey: true }), 'keyDown')
    expect(ctrl.text).toBeUndefined()
    expect(ctrl.modifiers).toBe(2)
    const meta = mapKeyboardEvent(key({ key: 'k', code: 'KeyK', metaKey: true }), 'keyDown')
    expect(meta.text).toBeUndefined()
  })

  it('maps special keys to their Windows virtual-key codes', () => {
    expect(mapKeyboardEvent(key({ key: 'Enter', code: 'Enter' }), 'keyDown').windowsVirtualKeyCode).toBe(13)
    expect(mapKeyboardEvent(key({ key: 'Backspace', code: 'Backspace' }), 'keyDown').windowsVirtualKeyCode).toBe(8)
    expect(mapKeyboardEvent(key({ key: 'ArrowLeft', code: 'ArrowLeft' }), 'keyDown').windowsVirtualKeyCode).toBe(37)
  })

  it('combines the full modifier bitmask (Alt=1 Ctrl=2 Meta=4 Shift=8)', () => {
    expect(mapKeyboardEvent(key({ key: 'c', code: 'KeyC', altKey: true, ctrlKey: true, shiftKey: true }), 'keyDown').modifiers).toBe(1 | 2 | 8)
  })

  it('flags auto-repeat', () => {
    expect(mapKeyboardEvent(key({ key: 'a', code: 'KeyA', repeat: true }), 'keyDown').autoRepeat).toBe(true)
  })

  it('round-trips a mapped key and an insertText through the wire protocol', () => {
    const mapped = mapKeyboardEvent(key({ key: 'a', code: 'KeyA' }), 'keyDown')
    expect(parseClientRequest({ v: 1, type: 'input.key', requestId: 'r1', targetKey: 'k'.repeat(20), event: mapped }))
      .toMatchObject({ type: 'input.key', event: { text: 'a' } })
    expect(parseClientRequest({ v: 1, type: 'input.text', requestId: 'r2', targetKey: 'k'.repeat(20), text: '你好' }))
      .toMatchObject({ type: 'input.text', text: '你好' })
  })
})
