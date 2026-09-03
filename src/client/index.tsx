import { createElement } from 'react'
// Context comes from the better-sidebar root (v0.17.x): the package no longer
// augments the standalone 'cordis' Context — it re-exports its own
// cordis-base & service-shape intersection with `betterSidebar` on it.
import type { Context } from 'dsh-better-sidebar'
import { SidebarCdpBrowser } from './SidebarCdpBrowser.tsx'
import { SettingsPanel } from './settings.tsx'
import { attachLocale, t } from './i18n.ts'

/** Services required before mounting: the sidebar registry (tab + settings
 *  panel) and the DSH locale service (zh/en copy follows the host-backed
 *  language preference instead of the raw browser language). */
export const inject = ['betterSidebar', 'locale']

function LiveIcon(props: { size?: number }) {
  const size = props.size ?? 16
  return createElement('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
    createElement('rect', { x: 1.5, y: 2.5, width: 13, height: 9, rx: 2, stroke: 'currentColor' }),
    createElement('path', { d: 'M5 14h6M8 11.5V14M5.5 7.2l1.5 1.5 3.5-3.5', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' }))
}

export function apply(ctx: Context): void {
  ctx.effect(() => attachLocale(ctx.locale), 'dsh-sidebar-cdp-browser: locale dictionaries')
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'dsh-sidebar-cdp-browser:live',
    title: () => t('title'),
    icon: (size: number) => createElement(LiveIcon, { size }),
    order: 55,
    single: true,
    settings: { render: props => createElement(SettingsPanel, props) },
    component: props => createElement(SidebarCdpBrowser, props),
  }), 'dsh-sidebar-cdp-browser: register live tab')
}
