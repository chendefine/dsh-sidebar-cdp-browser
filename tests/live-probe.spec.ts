/** Live probe (opt-in via CDP_PROBE=1): exercises the real Host path —
 *  discovery, WS-origin rewrite, puppeteer connect, target registry, and one
 *  screencast frame — against the remote Chromium configured below. Skipped
 *  in CI/normal `pnpm test` runs. */
import { expect, test } from 'vitest'
import { EndpointManager } from '../src/cdp/endpoint-manager.ts'
import { resolveCdpLiveConfig } from '../src/config.ts'

const ENDPOINT = process.env.CDP_PROBE_ENDPOINT ?? 'http://192.168.254.200:9223'

test.skipIf(process.env.CDP_PROBE !== '1')('host path against a live remote Chromium', { timeout: 30_000 }, async () => {
  // v0.3.0: the single endpoint comes from the (UI) source.
  const config = resolveCdpLiveConfig({})
  const endpoints = new EndpointManager(config, () => ENDPOINT)
  try {
    const managed = await endpoints.get()
    expect(managed.manager.state).toBe('connected')
    const targets = managed.manager.registry.list()
    console.log('live targets:', targets.map(t => `${t.type} ${t.url}`).join(' | ') || '(none)')
    expect(targets.length).toBeGreaterThan(0)
    const queue = await managed.manager.screencast.start(targets[0]!.key, { format: 'jpeg', quality: 60, maxWidth: 1280, maxHeight: 900 })
    const frame = await Promise.race([queue.take(), new Promise<undefined>(resolve => setTimeout(resolve, 8_000))])
    expect(frame).toBeDefined()
    console.log('live frame seq:', frame!.value.sequence, 'jpeg bytes:', Buffer.from(frame!.value.data, 'base64').length)
    // keyboard path: a real key event plus insertText (the IME path) must both
    // be accepted by the remote Chromium
    await managed.manager.input.dispatchKey(targets[0]!.key, { type: 'keyDown', key: 'a', code: 'KeyA', text: 'a', windowsVirtualKeyCode: 65 })
    await managed.manager.input.dispatchKey(targets[0]!.key, { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 })
    await managed.manager.input.insertText(targets[0]!.key, '你好')
    console.log('live keyboard: key events + insertText accepted')
    // target lifecycle (v0.2.0): create a tab, watch its registry entry appear
    // with a real title after navigation, then close it and watch it drop.
    const createdKey = await managed.manager.createTarget()
    expect(managed.manager.registry.list().some(t => t.key === createdKey)).toBe(true)
    // Viewport (v0.2.2): puppeteer's connect() defaultViewport (800x600) used
    // to be applied to every newPage — new tabs rendered narrow. With the
    // null override a fresh tab must match the browser's natural window size,
    // i.e. the same device width the pre-existing tab screencasts at.
    const newTabFrame = await managed.manager.screencast.start(createdKey, { format: 'jpeg', quality: 40 })
    const newTabShot = await Promise.race([newTabFrame.take(), new Promise<undefined>(resolve => setTimeout(resolve, 8_000))])
    expect(newTabShot).toBeDefined()
    const newTabWidth = newTabShot!.value?.metadata.deviceWidth ?? 0
    await managed.manager.screencast.stop(createdKey)
    console.log('live new tab device width:', newTabWidth)
    expect(newTabWidth).toBeGreaterThanOrEqual(1000)
    // Navigate the EXISTING tab (the address-bar flow). Chromium NEVER emits
    // the title-only TargetInfo update: the commit event carries the URL with
    // a TENTATIVE title ("baidu.com"), and the real document title is only
    // observable via Target.getTargets commands — refreshTargetInfoNow/the
    // poll must fetch it (the bug fixed in 0.2.3). example.com is useless
    // here: its title happens to arrive with the commit event.
    await managed.manager.input.navigate(createdKey, 'https://www.baidu.com/')
    await expect.poll(async () => managed.manager.registry.list().find(t => t.key === createdKey)?.title, { timeout: 15_000 })
      .toMatch(/百度/)
    const descriptor = managed.manager.registry.list().find(t => t.key === createdKey)
    console.log('live created tab after navigation:', JSON.stringify({ url: descriptor?.url, title: descriptor?.title }))
    expect(descriptor?.url).toMatch(/^https:\/\/www\.baidu\.com\//)
    expect((descriptor?.title ?? '').length).toBeGreaterThan(0)
    await managed.manager.closeTarget(createdKey)
    await expect.poll(async () => managed.manager.registry.list().some(t => t.key === createdKey), { timeout: 15_000 }).toBe(false)
    console.log('live lifecycle: create → titled page → close verified')
    // last-tab guard: with a single tab left, closing must be refused — the
    // remote browser must survive.
    const remaining = managed.manager.registry.list()
    if (remaining.length === 1) {
      await expect(managed.manager.closeTarget(remaining[0]!.key)).rejects.toThrow(/last remaining tab/i)
      expect(managed.manager.registry.list()).toHaveLength(1)
      console.log('live last-tab guard: close refused, browser still alive')
    }
  } finally {
    await endpoints.close()
  }
})
