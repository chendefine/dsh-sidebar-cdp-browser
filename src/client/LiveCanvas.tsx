import { useEffect, useRef, useState } from 'react'
import type { KeyInput, MouseInput } from './cdp-api.ts'
import { createFrameRenderer, type RenderedFrame } from './frame-renderer.ts'
import { frameSize, type DrawRect } from './geometry.ts'
import { attachInputBridge, attachKeyboardBridge } from './input-bridge.ts'
import { t } from './i18n.ts'
import css from './cdp-live.module.css'

export function LiveCanvas(props: {
  frame?: RenderedFrame
  interactive: boolean
  sendMouse(input: MouseInput, frameId?: number): boolean
  sendKey(input: KeyInput): boolean
  sendText(text: string): boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sinkRef = useRef<HTMLTextAreaElement>(null)
  const rendererRef = useRef(createFrameRenderer())
  const drawRef = useRef<DrawRect | null>(null)
  const propsRef = useRef(props)
  const keyboardActiveRef = useRef(false)
  const [drawVersion, setDrawVersion] = useState(0)
  const [typing, setTyping] = useState(false)
  propsRef.current = props

  useEffect(() => () => rendererRef.current.dispose(), [])
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || props.frame === undefined) return
    let cancelled = false
    void rendererRef.current.draw(canvas, props.frame).then(draw => { if (!cancelled) drawRef.current = draw })
    return () => { cancelled = true }
  }, [props.frame, drawVersion])
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const observer = new ResizeObserver(() => setDrawVersion(value => value + 1))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // Keyboard ownership: the view claims the keyboard on canvas pointerdown and
  // releases it on outside pointerdown (clicking the DSH chat input, another
  // panel, …). This flag gates the capture-phase window listeners, so keys flow
  // regardless of which element focus physically sits on.
  useEffect(() => {
    const claim = (): void => {
      keyboardActiveRef.current = true
      setTyping(true)
      sinkRef.current?.focus({ preventScroll: true })
    }
    const release = (event: PointerEvent): void => {
      if (canvasRef.current?.contains(event.target as Node) === true) return
      keyboardActiveRef.current = false
      setTyping(false)
    }
    window.addEventListener('pointerdown', release, { capture: true })
    const canvas = canvasRef.current
    canvas?.addEventListener('pointerdown', claim)
    return () => {
      window.removeEventListener('pointerdown', release, { capture: true } as EventListenerOptions)
      canvas?.removeEventListener('pointerdown', claim)
    }
  }, [props.interactive])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || !props.interactive) return
    return attachInputBridge({
      canvas,
      frameSize: () => frameSize(propsRef.current.frame?.metadata, { width: 1, height: 1 }),
      frameId: () => propsRef.current.frame?.sequence,
      drawRect: () => drawRef.current,
      sendMouse: (input, frameId) => propsRef.current.sendMouse(input, frameId),
    })
  }, [props.interactive])
  useEffect(() => {
    const sink = sinkRef.current
    if (sink === null || !props.interactive) return
    return attachKeyboardBridge({
      sink,
      enabled: () => keyboardActiveRef.current,
      sendKey: input => propsRef.current.sendKey(input),
      sendText: text => propsRef.current.sendText(text),
    })
  }, [props.interactive])
  // Losing interactivity (mode flip, tab hidden) must never leave keys stuck.
  useEffect(() => {
    if (props.interactive) return
    keyboardActiveRef.current = false
    sinkRef.current?.blur()
    setTyping(false)
  }, [props.interactive])

  return <div className={css.canvasWrap}>
    <canvas ref={canvasRef} className={css.liveCanvas} tabIndex={-1} aria-label="CDP live browser canvas" />
    {/* The IME/paste sink: focused when the view claims the keyboard; transparent and click-through. */}
    <textarea
      ref={sinkRef}
      className={css.keySink}
      tabIndex={-1}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      aria-hidden
    />
    {props.interactive && !typing && <div className={css.typeHint}>{t('clickToType')}</div>}
  </div>
}
