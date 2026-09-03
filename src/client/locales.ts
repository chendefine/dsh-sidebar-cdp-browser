/**
 * The zh/en copy tables. Language selection lives in i18n.ts (the DSH
 * locale service wiring); this module is pure data plus the key union.
 *
 * @module dsh-sidebar-cdp-browser/client/locales
 */

/** Dictionary namespace the plugin registers under the DSH locale service. */
export const NS = 'dsh-sidebar-cdp-browser'

const zh = {
  title: 'CDP 实时视图', reconnect: '重新连接',
  noTargets: '没有可用的浏览器 Target', selectTarget: '选择一个 Target', loading: '等待画面…',
  back: '后退', forward: '前进', reload: '刷新', navigate: '前往', address: '输入 URL',
  newTab: '新建标签页', closeTab: '关闭标签页', keepLastTab: '需至少保留一个标签页（关闭最后一个会使浏览器退出）',
  connected: '已连接', opening: '正在授权…', connecting: '连接中…', reconnecting: '正在重连…', disconnected: '未连接',
  hidden: '面板不可见，画面流已暂停', retry: '重试',
  endpoint: 'CDP 地址', endpointDesc: 'Chromium 远程调试地址（http(s) 或 ws(s)）；修改保存后实时视图会自动重连。',
  endpointFallback: '留空使用默认地址 127.0.0.1:9222。支持 host:port（自动补 http://）或完整 URL。',
  interactive: '交互输入', interactiveDesc: '总开关：允许控制远程浏览器；实际键鼠控制还需在视图标题栏勾选「键盘鼠标远程控制」。',
  remoteControl: '键盘鼠标远程控制',
  remoteControlHint: '勾选后本视图才能向远程浏览器发送键盘、鼠标与导航指令；切换会自动重连（默认不勾选，即仅观看）。',
  remoteControlLocked: '需先在插件设置（齿轮）中开启「交互输入」才能勾选。',
  frameQuality: '画面质量', frameQualityDesc: 'JPEG 编码质量，越高越清晰、占用带宽越大。',
  frameEveryNth: '抽帧间隔', frameEveryNthDesc: '每 N 帧取 1 帧；调大可降低负载，但画面会更卡顿。',
  frameMaxSize: '帧最大尺寸', frameMaxSizeDesc: '投影画面的像素上限，只影响清晰度与带宽，不改变页面实际布局。',
  frameWidth: '宽度', frameHeight: '高度',
  frameApplyHint: '帧参数保存后实时视图会自动重连，并按新参数取帧。',
  settingRangeHint: '超出范围的值保存时会自动收敛到最近的界限。',
  clickToType: '点击画面后可键盘输入',
  closeEndpointChanged: 'CDP 地址已变更，正在重连…',
  closeFrameChanged: '帧参数已更新，正在重连…',
  closeBackpressure: '画面消费过慢，背压保护已断开连接',
  closedWithCode: '连接已断开（{code}）',
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
  interactive: 'Interactive input', interactiveDesc: 'Master switch: allow controlling the remote browser; actual control still needs the header\'s "Keyboard & mouse control" checkbox.',
  remoteControl: 'Keyboard & mouse control',
  remoteControlHint: 'Only when checked can this view send keyboard, mouse, and navigation commands; toggling reconnects (unchecked by default — view-only).',
  remoteControlLocked: 'Turn on "Interactive input" in the plugin settings (gear) first.',
  frameQuality: 'Frame quality', frameQualityDesc: 'JPEG encoding quality; higher is sharper and heavier on bandwidth.',
  frameEveryNth: 'Frame interval', frameEveryNthDesc: 'Capture 1 of every N frames; higher trims load but looks choppier.',
  frameMaxSize: 'Max frame size', frameMaxSizeDesc: 'Pixel cap of the cast frames — sharpness/bandwidth only, never the page layout.',
  frameWidth: 'Width', frameHeight: 'Height',
  frameApplyHint: 'Frame parameters reconnect the live view once saved, casting with the new values.',
  settingRangeHint: 'Out-of-range values snap to the nearest bound on save.',
  clickToType: 'Click the view to type',
  closeEndpointChanged: 'CDP address changed; reconnecting…',
  closeFrameChanged: 'Frame settings changed; reconnecting…',
  closeBackpressure: 'Client fell behind; the backpressure guard closed the connection',
  closedWithCode: 'Connection closed ({code})',
}

export { zh, en }

/** Every copy key (the en table is the canonical key set). */
export type LocaleKey = keyof typeof en
