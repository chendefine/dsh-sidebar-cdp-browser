import type { KeyInput, MouseInput } from './cdp-api.ts'
import { clientToFrame, type DrawRect, type Size } from './geometry.ts'

export interface InputBridgeOptions {
  canvas: HTMLCanvasElement
  frameSize(): Size
  frameId(): number | undefined
  drawRect(): DrawRect | null
  sendMouse(input: MouseInput, frameId?: number): boolean
}

export function attachInputBridge(options: InputBridgeOptions): () => void {
  const { canvas } = options
  let buttons = 0
  let moveFrame: number | undefined
  let latestMove: PointerEvent | undefined
  const point = (event: PointerEvent | WheelEvent) => {
    const draw = options.drawRect()
    return draw ? clientToFrame({ x: event.clientX, y: event.clientY }, canvas.getBoundingClientRect(), draw, options.frameSize()) : null
  }
  const emit = (input: MouseInput): void => { options.sendMouse(input, options.frameId()) }
  const flushMove = (): void => {
    moveFrame = undefined
    const event = latestMove
    latestMove = undefined
    if (event === undefined) return
    const p = point(event)
    if (p !== null) emit({ type: 'mouseMoved', ...p, button: 'none', buttons, modifiers: modifiersOf(event) })
  }
  const move = (event: PointerEvent) => {
    latestMove = event
    if (moveFrame === undefined) moveFrame = window.requestAnimationFrame(flushMove)
  }
  const down = (event: PointerEvent) => {
    const p = point(event)
    if (p === null) return
    canvas.setPointerCapture(event.pointerId)
    buttons = event.buttons
    emit({ type: 'mousePressed', ...p, button: buttonOf(event.button), buttons, clickCount: event.detail || 1, modifiers: modifiersOf(event) })
  }
  const release = (event: PointerEvent, cancelled = false) => {
    const p = point(event)
    buttons = cancelled ? 0 : event.buttons
    if (p !== null) emit({ type: 'mouseReleased', ...p, button: cancelled ? 'none' : buttonOf(event.button), buttons, clickCount: event.detail || 1, modifiers: modifiersOf(event) })
  }
  const wheel = (event: WheelEvent) => {
    const p = point(event)
    if (p === null) return
    event.preventDefault()
    const factor = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? options.frameSize().height : 1
    emit({ type: 'mouseWheel', ...p, button: 'none', buttons, deltaX: event.deltaX * factor, deltaY: event.deltaY * factor, modifiers: modifiersOf(event) })
  }
  const context = (event: MouseEvent) => event.preventDefault()
  const cancel = (event: PointerEvent) => release(event, true)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', cancel)
  canvas.addEventListener('wheel', wheel, { passive: false })
  canvas.addEventListener('contextmenu', context)
  return () => {
    if (moveFrame !== undefined) window.cancelAnimationFrame(moveFrame)
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointerup', release)
    canvas.removeEventListener('pointercancel', cancel)
    canvas.removeEventListener('wheel', wheel)
    canvas.removeEventListener('contextmenu', context)
  }
}

function buttonOf(button: number): MouseInput['button'] {
  return button === 0 ? 'left' : button === 1 ? 'middle' : button === 2 ? 'right' : button === 3 ? 'back' : button === 4 ? 'forward' : 'none'
}

function modifiersOf(event: MouseEvent): number {
  return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0)
}

// ── Keyboard ────────────────────────────────────────────────────────────────

/** Windows virtual-key codes for the keys pages most often switch on. */
const VK: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, CapsLock: 20,
  Escape: 27, Space: 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46,
  Meta: 91, ContextMenu: 93,
}

const KEYBOARD_EVENT_SHAPE = {
  key: 'string', code: 'string', repeat: 'boolean',
  altKey: 'boolean', ctrlKey: 'boolean', metaKey: 'boolean', shiftKey: 'boolean',
}

/** The subset of KeyboardEvent the mapper reads (plain object testable). */
export type KeyboardEventLike = { [K in keyof typeof KEYBOARD_EVENT_SHAPE]?: unknown }

/** Map a DOM keyboard event to the CDP key input. Printable keys carry `text`
 *  so the page's own input pipeline produces the character (the Puppeteer
 *  `keyboard.type` semantics); Ctrl/Meta combos suppress text — they are
 *  shortcuts, not typing. */
export function mapKeyboardEvent(event: KeyboardEventLike, type: 'keyDown' | 'keyUp', keyCodeOf: (event: KeyboardEventLike) => number | undefined = keyCodeFor): KeyInput {
  const key = typeof event.key === 'string' ? event.key : ''
  const code = typeof event.code === 'string' ? event.code : ''
  const ctrlOrMeta = event.ctrlKey === true || event.metaKey === true
  const modifiers = (event.altKey === true ? 1 : 0) | (event.ctrlKey === true ? 2 : 0) | (event.metaKey === true ? 4 : 0) | (event.shiftKey === true ? 8 : 0)
  const printable = key.length === 1 && !ctrlOrMeta
  const keyCode = keyCodeOf(event)
  return {
    type,
    ...(key !== '' ? { key } : {}),
    ...(code !== '' ? { code } : {}),
    ...(printable ? { text: key, unmodifiedText: key.toLowerCase() } : {}),
    ...(keyCode !== undefined ? { windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode } : {}),
    modifiers,
    ...(event.repeat === true ? { autoRepeat: true } : {}),
  }
}

function keyCodeFor(event: KeyboardEventLike): number | undefined {
  const key = typeof event.key === 'string' ? event.key : ''
  if (key in VK) return VK[key]
  if (key.length === 1) {
    const charCode = key.toUpperCase().charCodeAt(0)
    if ((charCode >= 48 && charCode <= 57) || (charCode >= 65 && charCode <= 90)) return charCode
  }
  return undefined
}

export interface KeyboardBridgeOptions {
  /** A hidden textarea owning IME composition while the view is active. */
  sink: HTMLTextAreaElement
  /** Whether the live view currently owns keyboard input (view focused/active). */
  enabled(): boolean
  sendKey(input: KeyInput): boolean
  sendText(text: string): boolean
}

/**
 * Bridge keyboard input to CDP through two cooperating paths:
 *
 * 1. CAPTURE-PHASE WINDOW LISTENERS for keydown/keyup. This is the v0.1.1
 *    fix for the v0.1.0 "cannot type" bug: the hidden sink's programmatic focus is fragile
 *    (browsers may refuse or immediately move focus for a 1px,
 *    pointer-events:none textarea inside an overflow-hidden container, and the
 *    click itself re-targets focus to the canvas). A capture listener on
 *    `window` fires regardless of what element holds focus, so as long as the
 *    view is marked active (clicked, and no other DSH input owns the event)
 *    the keys flow. Events whose TARGET is an INPUT/TEXTAREA/SELECT or a
 *    contenteditable element are skipped, so typing into the DSH chat box or
 *    the sidebar's own fields never leaks into the remote page.
 *
 * 2. THE HIDDEN SINK for IME composition and paste only — the one thing that
 *    genuinely requires real focus. The view re-asserts focus on the sink at
 *    every canvas pointerdown (the keyboard claim) instead of relying on any
 *    earlier focus call surviving.
 *
 * - plain printable keys → keyDown/keyUp with `text` (page-side input pipeline);
 * - Ctrl/Meta shortcuts → keyDown/keyUp without text;
 * - IME → native composition in the sink; compositionend → one insertText;
 * - paste → the sink's paste event (browser-mediated clipboard) → insertText;
 * - blur / disable releases every still-pressed key (no stuck keys).
 */
export function attachKeyboardBridge(options: KeyboardBridgeOptions): () => void {
  const { sink } = options
  const pressed = new Map<string, KeyInput>()

  const isTypingElsewhere = (event: KeyboardEvent): boolean => {
    const target = event.target as HTMLElement | null
    if (target === null || typeof target.tagName !== 'string') return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
  }

  const shouldHandle = (event: KeyboardEvent): boolean =>
    options.enabled() && !isTypingElsewhere(event)

  const down = (event: KeyboardEvent): void => {
    if (!shouldHandle(event)) return
    // IME composition owns these keys; compositionend delivers the result.
    if (event.isComposing || event.key === 'Process') return
    // Paste travels through the sink's paste event instead (clipboard access
    // needs the browser-mediated path; a forwarded Ctrl+V has no local data).
    if ((event.ctrlKey || event.metaKey) && (event.key === 'v' || event.key === 'V')) return
    const input = mapKeyboardEvent(event, 'keyDown')
    pressed.set(event.code, { ...input, type: 'keyUp' })
    options.sendKey(input)
    event.preventDefault()
    event.stopPropagation()
  }
  const up = (event: KeyboardEvent): void => {
    if (!shouldHandle(event)) return
    const release = pressed.get(event.code) ?? mapKeyboardEvent(event, 'keyUp')
    pressed.delete(event.code)
    options.sendKey(release)
    event.preventDefault()
    event.stopPropagation()
  }
  const compositionEnd = (event: CompositionEvent): void => {
    if (event.data !== '') options.sendText(event.data)
  }
  const paste = (event: ClipboardEvent): void => {
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (text !== '') {
      options.sendText(text)
      event.preventDefault()
    }
  }
  const releaseAll = (): void => {
    for (const [code, release] of pressed) {
      pressed.delete(code)
      options.sendKey(release)
    }
  }

  // capture phase: win the race against the page's own handlers, and fire
  // regardless of which element focus landed on after the click.
  window.addEventListener('keydown', down, { capture: true })
  window.addEventListener('keyup', up, { capture: true })
  sink.addEventListener('compositionend', compositionEnd)
  sink.addEventListener('paste', paste as EventListener)
  sink.addEventListener('blur', releaseAll)
  return () => {
    window.removeEventListener('keydown', down, { capture: true } as EventListenerOptions)
    window.removeEventListener('keyup', up, { capture: true } as EventListenerOptions)
    sink.removeEventListener('compositionend', compositionEnd)
    sink.removeEventListener('paste', paste as EventListener)
    sink.removeEventListener('blur', releaseAll)
    releaseAll()
  }
}
