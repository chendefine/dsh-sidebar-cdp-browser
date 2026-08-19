const zh = {
  title: 'CDP 实时视图', reconnect: '重新连接',
  noTargets: '没有可用的浏览器 Target', selectTarget: '选择一个 Target', loading: '等待画面…',
  back: '后退', forward: '前进', reload: '刷新', navigate: '前往', address: '输入 URL',
  newTab: '新建标签页', closeTab: '关闭标签页', keepLastTab: '需至少保留一个标签页（关闭最后一个会使浏览器退出）',
  connected: '已连接', opening: '正在授权…', connecting: '连接中…', reconnecting: '正在重连…', disconnected: '未连接',
  hidden: '面板不可见，画面流已暂停', retry: '重试',
  endpoint: 'CDP 地址', endpointDesc: 'Chromium 远程调试地址（http(s) 或 ws(s)）；修改保存后实时视图会自动重连。',
  endpointFallback: '留空使用默认地址 127.0.0.1:9222。支持 host:port（自动补 http://）或完整 URL。',
  interactive: '交互输入', interactiveDesc: '允许向页面转发指针、滚轮与导航事件。',
  clickToType: '点击画面后可键盘输入',
}
const en = {
  title: 'CDP Live View', reconnect: 'Reconnect',
  noTargets: 'No browser targets are available', selectTarget: 'Select a target', loading: 'Waiting for frames…',
  back: 'Back', forward: 'Forward', reload: 'Reload', navigate: 'Go', address: 'Enter URL',
  newTab: 'New tab', closeTab: 'Close tab', keepLastTab: 'Keep at least one tab open (closing the last one exits the browser)',
  connected: 'Connected', opening: 'Authorizing…', connecting: 'Connecting…', reconnecting: 'Reconnecting…', disconnected: 'Disconnected',
  hidden: 'The panel is hidden; streaming is paused', retry: 'Retry',
  endpoint: 'CDP address', endpointDesc: 'Chromium remote debugging address (http(s) or ws(s)); the live view reconnects automatically after saving a change.',
  endpointFallback: 'Leave empty to use the default 127.0.0.1:9222. Accepts host:port (http:// is assumed) or a full URL.',
  interactive: 'Interactive input', interactiveDesc: 'Forward pointer, wheel, and navigation events to the page.',
  clickToType: 'Click the view to type',
}

export type LocaleKey = keyof typeof en
export function isZh(): boolean { return typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language) }
export function t(key: LocaleKey): string { return (isZh() ? zh : en)[key] }
