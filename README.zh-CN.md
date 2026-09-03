# dsh-sidebar-cdp-browser

[English](./README.md) · [npm](https://www.npmjs.com/package/dsh-sidebar-cdp-browser) · [GitHub](https://github.com/chendefine/dsh-sidebar-cdp-browser)

为 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 侧边栏注册一个「CDP 实时视图」标签页（[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) / DSH 插件）：把一个**外部 Chromium** 的画面以 JPEG 像素流实时投进 DSH Web 界面，并在**严格受限**的命令白名单内回传键鼠操作。目标网页**不会**作为 iframe 嵌入——Host 进程独占 CDP 连接，浏览器端既拿不到 CDP 地址，也发不出任意 CDP 透传命令。

![npm](https://img.shields.io/npm/v/dsh-sidebar-cdp-browser) ![license](https://img.shields.io/npm/l/dsh-sidebar-cdp-browser) ![node](https://img.shields.io/node/v/dsh-sidebar-cdp-browser)

## 界面截图

![在设置页配置 CDP 地址与「允许交互」开关](dsh_plugin_config_cdp.png)

![DSH Web 侧边栏中的 CDP 实时视图](dsh_sidebar_view_cdp.png)

```
DSH Web (浏览器)                     DSH Host 进程                      外部 Chromium
┌──────────────────┐   POST /dsh-cdp-live/api/open   ┌──────────────┐
│ 侧边栏 Tab        │  ────────────────────────────►  │ 签发一次性    │
│ (React + Canvas) │   ◄──── ticket (TTL 30s) ──────  │ 256-bit ticket│
│                  │                                 │              │   唯一 CDP 连接
│ 渲染 JPEG 帧 ◄───┼── WS /sidebar/ws/cdp-live ──────┼─ puppeteer ──┼──► :9222
 │                 │   帧元信息 JSON + 二进制 JPEG     │  -core       │   (screencast
 └─│──────────────┘                                 └──────────────┘    + Input)
   └ 受限命令白名单（zod strict 判别联合，无任意 CDP 透传）
```

- 包名：[dsh-sidebar-cdp-browser（npm）](https://www.npmjs.com/package/dsh-sidebar-cdp-browser)
- 源码：[chendefine/dsh-sidebar-cdp-browser（GitHub）](https://github.com/chendefine/dsh-sidebar-cdp-browser)
- 版本：0.1.1
- 许可证：MIT
- 平台：web（DSH Web GUI）
- 依赖：[dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) ≥ 0.17.1（**必选 peer**）
- 测试：87 例 / 17 个规格文件（其中 1 例为需真实 Chromium 的 opt-in 探针，默认跳过）

## 功能简介

**实时视图**

- 在 better-sidebar 侧边栏注册「CDP 实时视图」标签（tab id `dsh-sidebar-cdp-browser:live`），Canvas 渲染远端页面的实时像素流（`Page.startScreencast` JPEG 帧，等比 contain 适配、按 devicePixelRatio 高清绘制）；
- 顶部标签条列出全部 page target：切换、新建、关闭（title 以 `Target.getTargets` 快照为准，1s 轮询刷新）；
- 工具栏提供地址栏导航（输入 HTTP(S) 地址回车 / 前进 / 后退 / 刷新）与手动重连；断线后客户端自动退避重连；
- Tab 隐藏或面板折叠时自动停止帧流（better-sidebar 的 `visible` gating），重新可见即恢复；
- 界面文案中英双语，跟随 DSH 宿主语言偏好（经 locale 服务注册词典，浏览器语言仅作服务缺席时的回退）；宿主侧已知的断连原因同样本地化显示，loader 配置字段自带中英文说明。

**受控交互**

- 鼠标：点击、拖动、滚轮，坐标按帧画面映射回页面；键盘：点击画面获得焦点后直接输入，中文等 IME 走 composition 合成后一次性提交，粘贴经本机剪贴板转成文本插入（复制 / Ctrl+C 暂不支持）；
- Client 能发出的命令是一个 **zod `strict()` 判别联合**（`src/cdp/protocol.ts`）——target 生命周期、screencast start/stop、`Input.dispatch*`、`Page.navigate` / `history`、ping，**没有任何 `{method, params}` 形式的任意 CDP 透传**；
- 交互受**两级门控**（见[使用方法](#两级控制门)）：「交互输入」设置总开关 + 视图标题栏「键盘鼠标远程控制」复选框；二者同时打开该视图才是 interactive 模式，Host 按 ticket 里的 mode 强制拦截——未授权时即使伪造客户端也发不出任何控制命令。

**设置面板**

- 「设置 → 侧边卡片 → 侧边栏内容 → CDP实时视图」齿轮弹层：CDP 地址、交互输入总开关、四个帧采集参数（质量 / 抽帧间隔 / 帧最大宽 × 高）；
- CDP 地址在 Web UI 配置并持久化（better-sidebar prefs 文档），无需改 loader 配置；保存后 Host 自动断开旧连接、实时视图自动重连到新地址；
- 帧参数支持 UI 覆盖（逐字段优先于 loader 配置），越界或非法的存储值被 Host 静默丢弃、回落安全值。

## 适用场景

- **远程 / 无头 Chromium 可视化**：浏览器跑在服务器或容器里，你在 DSH 界面里直接看、直接点；
- **在 DSH 会话中观察浏览器自动化**：agent 操作浏览器的同时，人可以实时盯着画面，随时接管；
- **轻量 VNC 替代**：只针对浏览器这一种「远程桌面」，不需要装任何客户端；
- **受控演示 / 排查**：把一个测试浏览器投影给同事看，导航、点击都在权限模型之内；
- 像素流 + 受控输入的模型，天然适合把一个浏览器会话「投影」给多个观察者，或交给 AI 会话的操纵者监督。

## 安装方法

### 前提

- Node.js ≥ 20 的 DSH 宿主（Web GUI，`web` profile）；
- [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) ≥ 0.17.1——**必选 peer 依赖**：本插件的 Tab 经它注册，不安装则 Tab 不会出现（推荐用下面的一句组合命令一起安装）；
- 一个已启动、且能从 DSH Host 进程访问的 Chromium CDP endpoint。示例：

  ```sh
  chromium \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port=9222
  ```

### 插件本体

包内声明了 `dsh.bundle.patch`（`cordis.patch.yml`：一条 insert 行，挂载 host 半 entry）。从 npm registry 安装（预构建产物，无需构建许可）——一条命令同时安装框架与本插件：

```sh
dsh plugin --profile web add dsh-better-sidebar dsh-sidebar-cdp-browser
```

从 GitHub 仓库安装（源码——pnpm 会执行 `prepare` 构建）：

```sh
dsh plugin --profile web add dsh-better-sidebar github:chendefine/dsh-sidebar-cdp-browser
```

或经 DSH 插件市场（设置 → DSH插件市场）——给仓库打上 `dsh-plugin` topic 即被自动收录。

> pnpm 可能拦截 better-sidebar 的原生依赖构建（如 `node-pty`），按提示把具体包名加入 profile 目录下 `pnpm-workspace.yaml` 的 `allowBuilds` 后重跑即可。

插件加入 profile 层叠后需**重启 `dsh web`** 才加载；卸载用 `dsh plugin --profile web remove dsh-sidebar-cdp-browser`，再重启一次。

## 使用方法

### 配置 CDP 地址

CDP 地址**在 DSH Web 设置页配置**，不需要改 profile 数组：

1. 打开 **设置 → 侧边卡片 → 侧边栏内容 → CDP实时视图**，点击卡片右下角的齿轮；
2. 在「CDP 地址」输入框填写地址，失焦或按 Enter 保存；
3. **留空 = 默认地址 `127.0.0.1:9222`**；
4. 支持的格式：
   - `host:port`（自动补 `http://`）或 `http://host:port`：Host 从 `/json/version` 发现 `webSocketDebuggerUrl`；
   - `https://` / `wss://`：同上，TLS 由部署层保证；
   - `ws://.../devtools/browser/...`：直接连接 browser WebSocket；
5. 保存后 Host 断开旧连接，已打开的实时视图自动重连到新地址。

地址持久化在 better-sidebar 的 prefs 文档（`pluginSettings['dsh-sidebar-cdp-browser:live'].endpoint`），Host 通过 DSH settings 服务读取并订阅变更。**没有 loopback 限制**——远程地址直接可用，请自行确保网络可达与访问控制。

### 两级控制门

同一设置面板的「交互输入」总开关，配合视图标题栏的「键盘鼠标远程控制」复选框构成两级控制门：

- **交互输入 关闭（默认）**：observe 模式，只能看；标题栏复选框**置灰且不可勾选**；
- **交互输入 打开**：允许控制，但复选框仍**默认不勾选**（同样只能看）；在视图标题栏「已连接」左侧勾选「键盘鼠标远程控制」后，该视图才真正变为 interactive 模式（可点击、输入、导航、新建/关闭标签页），取消勾选立即回到仅观看。

复选框状态**不持久化**：刷新页面或重新打开面板后回到未勾选（默认安全）。任一开关变化都会让实时视图按新模式自动重连，Host 侧按 ticket 模式强制拦截——未授权时即使伪造客户端也发不出任何控制命令。

### 日常操作

- **键盘鼠标远程控制**：标题栏「已连接」左侧的复选框（见上级）；
- **标签页（target）切换 / 新建 / 关闭**：顶部标签条，需要 interactive 模式；
- **鼠标**：点击、拖动、滚轮，坐标按帧画面映射回页面；
- **键盘**：先点击画面获得焦点，之后直接输入。中文等 IME 走 composition 合成后一次性提交；粘贴经本机剪贴板转成文本插入；**复制（Ctrl+C）暂不支持**；
- **导航**：工具栏输入 HTTP(S) 地址回车，或使用 back / forward / reload；
- **连接**：工具栏可手动重连；断线后客户端自动退避重连。

### Loader 运行时调优（可选）

profile 配置里的可选项（均可省略，括号内为默认值与范围）。四个 `frame*` 字段同时是 Web UI 设置项的**部署默认值**——UI 改过的字段以 UI 为准：

```yaml
- insert:
    - id: sidebar-cdp-browser
      name: dsh-sidebar-cdp-browser
      config:
        frameQuality: 60        # JPEG 质量 (20–90)
        frameMaxWidth: 1280     # 帧最大宽 (320–3840)
        frameMaxHeight: 900     # 帧最大高 (240–2160)
```

| 字段                      | 默认值  | 范围                             |
| ------------------------- | ------- | -------------------------------- |
| `ticketTtlMs`             | 30000   | 5000–120000，一次性 ticket 有效期 |
| `connectTimeoutMs`        | 15000   | 1000–120000，CDP 连接超时         |
| `frameQuality`            | 60      | 20–90，JPEG 质量                  |
| `frameMaxWidth`           | 1280    | 320–3840                         |
| `frameMaxHeight`          | 900     | 240–2160                         |
| `frameEveryNth`           | 1       | 1–30，每 N 帧取 1 帧              |
| `bufferedAmountSoftLimit` | 524288  | 64KB–16MB，超过开始丢帧           |
| `bufferedAmountHardLimit` | 4194304 | 256KB–64MB，超过断开连接          |

### 帧参数的 Web UI 设置

四个帧采集参数（`frameQuality` / `frameEveryNth` / `frameMaxWidth` / `frameMaxHeight`）除了 loader 配置外，**也可以直接在 Web UI 的功能设置弹层里调整**：

- 弹层样式与其它「侧边栏内容」的功能设置一致（行卡片 + 开关 + 数字输入）；宽 × 高 并排为一行；
- 未改动过的字段在弹层里显示**当前生效值**（loader 配置；取不到时显示代码默认值），改动保存后即写入 prefs 文档，作为该字段的显式覆盖；
- **UI 覆盖优先于 loader 配置**（逐字段生效）：UI 只写被改过的字段，其余字段继续沿用 loader 值；越界或非法的存储值会被 Host 静默丢弃，回落到 loader 值；
- 保存后 Host 会以 `1012` 断开实时视图并自动重连，新参数在重连后的下一次 `Page.startScreencast` 生效；
- 面板通过只读路由 `GET /dsh-cdp-live/api/config` 获取当前生效值（同样受 trust fence 保护）。

注意：`frameMaxWidth` / `frameMaxHeight` 只是**投影像素上限**（抓帧后等比缩小的上限），不影响浏览器中网页的实际布局宽高——页面始终按远端 Chromium 窗口的真实 viewport 渲染（本插件连接时显式 `defaultViewport: null`，从不覆写 viewport）。

### 排障

被拒绝的 WebSocket 升级返回明确的 HTTP 状态，浏览器控制台显示 `Unexpected response code: <status>`：

| 状态 | 含义 | 处理 |
| --- | --- | --- |
| 401 | ticket 无效或已过期 | 客户端会自动重新调 `/open` 拿新 ticket；持续出现请检查会话是否仍存活 |
| 403 | trust fence 拒绝（Host 头不在信任列表，或带 cross-site 标记） | 经反向代理访问时确认代理转发了正确的 Host 头 |
| 404 | 路径错误 / 会话不存在 | 确认路由路径与会话 id |
| 1006（无状态码） | 请求在反向代理层就被掐断 | 反代必须转发 WebSocket 升级头（见下） |
| 1011（应用层 close） | CDP 连接 / attach 失败 | 看 DSH Host 日志（见下） |
| 1012（应用层 close） | 设置变更（地址 / 帧参数），属预期 | 客户端自动重连，无需处理 |
| 1013（应用层 close） | 客户端消费过慢，超过硬背压限 | 正常网络恢复后自动重连；频繁出现可调大 `bufferedAmount*Limit` 或降低质量 |

nginx WebSocket 升级转发示例：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
location / {
    proxy_pass http://127.0.0.1:3080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
}
```

CDP 连接失败会在 DSH Host 日志里输出 `[dsh-sidebar-cdp-browser] CDP session attach failed: ...`，浏览器端只看到断连，排障先看 Host 日志。

## 技术架构

### 双端结构

DSH 插件分 host（node）半与 browser 半，本插件各自职责：

```text
┌──────────────── DSH Host 进程 ────────────────┐      ┌── Chromium ──┐
│  Host half (src/index.ts)                     │      │              │
│  ├─ POST /dsh-cdp-live/api/open  ── 签发 ticket│      │  CDP :9222   │
│  ├─ GET  /dsh-cdp-live/api/config── 生效帧参数 │      │  (screencast │
│  ├─ WS   /sidebar/ws/cdp-live    ── 业务协议   │      │   + Input)   │
│  └─ EndpointManager → puppeteer-core ────────────────┤              │
└───────────────────────────────────────────────┘      └──────────────┘
         ▲ ticket + 二进制帧（JSON 元信息 + JPEG）      ┌── 浏览器 ────┐
         │                                            │ Client half  │
         └────────────────────────────────────────────┤ Canvas 渲染  │
              鼠标/键盘/导航等受限命令（zod 白名单）      └──────────────┘
```

- **host 半**（`src/`，inject `webServer` / `sessions` / `webRuntime`）：注册 HTTP 与 WebSocket 路由，经 puppeteer-core 维持唯一一条 CDP 连接；订阅 DSH settings 服务读取 Web UI 的地址与帧参数覆盖，设置提交即热切换连接；
- **client 半**（`src/client/`，经 `dsh-better-sidebar` 注册 Tab）：React 组件，Canvas 渲染帧，把输入事件翻译成受限命令。

### 连接握手

```text
POST /dsh-cdp-live/api/open        → trust fence + DSH session 校验
                                   → 签发一次性 256-bit ticket（TTL 默认 30s）
GET  /dsh-cdp-live/api/config      → trust fence；返回当前生效帧参数（loader 与 UI 覆盖合并）
WS   /sidebar/ws/cdp-live?ticket=… → trust fence + ticket 一次性消费
                                   → 101 后进入版本化协议（v: 1）
```

- Client 从头到尾不知道 CDP 地址，也拿不到任何 CDP 凭据——连接和 target ID 都是 Host 进程内的临时状态；
- ticket 绑定 session 与模式（observe / interactive），用一次即废；
- 升级请求**不要求 Origin**：DSH 常见反代模式会把 Host 重写为 loopback 并丢弃 Origin，因此准入门槛是 trust fence（Host + cross-site 标记）加一次性 ticket。

### 帧流水线与背压

```text
Page.startScreencast (JPEG; 质量/尺寸/抽帧参数 = loader 配置 ∪ Web UI 覆盖，逐字段取 UI 优先)
  → Host 收到 Page.screencastFrame 后立即 ACK（与下游消费解耦）
  → LatestFrameQueue        单槽最新帧队列：生产者永不阻塞，新帧顶掉旧帧
  → ws.send(frameMeta JSON) 元信息（sequence / mimeType / byteLength …）
  → ws.send(JPEG bytes)     二进制帧紧随其后
  → Client Canvas 绘制
```

两级背压基于 `ws.bufferedAmount`：

- 超过**软限**（默认 512KB）：丢帧不发送，画面稍旧但连接健康；
- 超过**硬限**（默认 4MB）：直接以 `1013` 断开，防止慢客户端无限积压内存。

### 命令协议

版本化（`v: 1`，zod `strict()` 判别联合，`src/cdp/protocol.ts`），Client 可发命令枚举如下：

- `targets.list` / `targets.create` / `target.select` / `target.detach` / `target.close`
- `visibility`（Tab 隐藏 / 恢复的帧流开关）
- `screencast.start` / `screencast.stop`（选项：format / quality / maxWidth / maxHeight / everyNthFrame）
- `input.mouse` / `input.key` / `input.text`
- `navigate`（仅 `http(s)` URL）/ `history`（back / forward / reload）
- `ping`

Server 下行 `ready` / `response` / `targets.changed` / `target.closed` / `frame` / `error` 同为 strict schema；未知字段一律拒绝。

### 连接与租约管理

- **EndpointManager**：单条隐式 CDP 连接，generation 标识；设置页变更地址 → Host 监听 `settings/document-updated` → 关旧连接、以 `1012` 弹开客户端 → 客户端退避重连落到新地址；`http(s)` 地址经 `/json/version` 发现 `webSocketDebuggerUrl`，`ws(s)` 地址直连，连接超时与重试可调；
- **LeaseManager**：同一 target 的 screencast 帧队列同一时刻只有一个消费者，切换 target 先释放旧租约；
- **TargetRegistry**：target 发现、切换与销毁通知（title 以 `Target.getTargets` 快照为准，1s 轮询；导航后的真实文档标题经同命令补齐）。

### 安全边界

默认开放的 CDP 能力仅包括：target 生命周期、screencast start/stop/ack、`Input.dispatch*`、`Page.navigate` / `Page.reload` / navigation history。

交互命令（键鼠 / 导航 / 标签页管理）受两级门控：「交互输入」设置（总开关）+ 标题栏「键盘鼠标远程控制」复选框（运行时逐视图，默认不勾选）。二者都打开才会以 interactive 模式建立会话；Host 按 ticket 里的 mode 强制拦截一切控制命令。

默认**不**开放：

- `Runtime.evaluate`；
- Cookie / Storage / Network；
- 下载、上传、权限授予；
- 任意 CDP method passthrough；
- DevTools frontend。

注意两点：

1. CDP 地址由 Web UI 配置，Host 不施加 loopback 限制——能打开该设置页的会话就能让 DSH Host 向任意地址发起连接，请仅在可信环境暴露设置页；
2. trust fence 防的是 cross-site 与 DNS rebinding，**不替代用户认证**；Keyless DSH 应仅作为本机单用户工具使用。

### 目录结构

```text
src/
├── index.ts              # host 半入口：路由注册、settings 订阅、热切换（inject: webServer, sessions, webRuntime）
├── config.ts             # 配置 schema（schemastery + zod 双形态）与 endpoint 归一化（4 测试经 endpoint-config 覆盖）
├── frame-settings.ts     # 帧参数单一 spec 表：范围/默认/覆盖读取/合并（host 与 client 共享纯逻辑）（6 测试）
├── trust-fence.ts        # Host/cross-site 信任判定（5 测试，经 cdp-security）
├── routes/
│   ├── http.ts           # /open + /config 路由 + 一次性 ticket registry
│   └── websocket.ts      # WS 升级路由（trust fence + ticket 准入 + 401/403/404 拒绝）
├── cdp/
│   ├── live-session.ts   # 会话编排：attach、命令分发、帧泵、1012/1013 生命周期
│   ├── endpoint-manager.ts / browser-connection-manager.ts / puppeteer-adapter.ts   # 唯一 CDP 连接（9 测试，经 cdp-manager）
│   ├── screencast-controller.ts / frame-queue.ts    # 抓帧与单槽最新帧队列（3 测试）
│   ├── input-controller.ts / target-controller.ts / target-registry.ts
│   ├── lease-manager.ts  # target 独占租约
│   └── protocol.ts       # 版本化协议 zod schema（4 测试）
└── client/               # better-sidebar Tab（React + Canvas + 输入桥接）
    ├── index.tsx         # browser 半入口：注册 tab + 设置面板（ctx.effect）
    ├── SidebarCdpBrowser.tsx  # 视图组装：settings / socket / target store
    ├── use-cdp-socket.ts      # WS 客户端：ticket 获取、退避重连、二进制帧
    ├── use-target-store.ts    # target 状态
    ├── LiveCanvas.tsx         # Canvas + IME sink + 键盘所有权
    ├── input-bridge.ts        # 鼠标桥接 + 捕获阶段键盘桥接（7+5+3 测试）
    ├── frame-renderer.ts      # ImageBitmap 渲染（contain 适配 + DPR）
    ├── geometry.ts            # contain-fit 坐标映射（3 测试）
    ├── TargetTabStrip.tsx / BrowserToolbar.tsx / ConnectionToolbar.tsx / StatusOverlay.tsx   # Chrome 组件（13 测试）
    ├── settings.tsx           # 功能设置面板：地址 / 交互开关 / 帧参数行（10 测试）
    ├── i18n.ts                # locale 服务挂接：注册 zh/en 词典 + t()（跟随 DSH 语言偏好）+ 断连原因本地化
    └── locales.ts             # zh/en 词典（键集合强制对齐，5 测试）
tests/                    # vitest：87 例 / 17 文件（live-probe 为 opt-in 实机探针；live-wiring 起真实回环 HTTP/WS 服务；client-bundle 校验产物身份与纯度）
cordis.patch.yml          # bundle 通道的 host 半 insert 行（挂载声明）
tsdown.config.ts          # 双 bundle 构建（host ESM + client ModuleLoader 注册格式 + 纯度门 + CSS 内联）
pnpm-workspace.yaml       # pnpm ≥ 11 专属设置（allowBuilds / minimumReleaseAgeExclude）
lib/                      # 构建产物（lib/index.js Host 半 ESM；lib/client.js client bundle；lib/types 类型声明）
```

构建产物交付：host 半为普通 ESM bundle（`puppeteer-core` / `ws` / `zod` 等随包分发）；browser 半为 `window.__ModuleLoader__.load({ id, factory })` 注册格式（官方外部 client 插件交付格式），React / cordis 走 external，并带**纯度门**——拒绝 Node 内建与 `@deepseek-ai/*` 值导入，`tests/client-bundle.spec.ts` 在构建后校验产物身份与浏览器纯度。

## 开发细节和规范

### 构建与测试

```sh
git clone https://github.com/chendefine/dsh-sidebar-cdp-browser && cd dsh-sidebar-cdp-browser
pnpm install       # 安装依赖（prepare 会先构建一次）
pnpm typecheck     # tsc --noEmit
pnpm test          # 构建后跑 vitest（82 例）
pnpm build         # rm -rf lib && tsc 声明 + tsdown 双 bundle → lib/
```

需要真实 Chromium 的实机探针：`CDP_PROBE=1 pnpm vitest run tests/live-probe.spec.ts`（可用 `CDP_PROBE_ENDPOINT` 指定地址）。

### 环境与规范要点

- **pnpm ≥ 11**：pnpm 专属设置只从 `pnpm-workspace.yaml` 读取（`.npmrc` 中的同名键会被静默忽略）。本仓库在其中固定 `allowBuilds.node-pty: false`（better-sidebar 的可选原生依赖仅类型引用，不运行其构建）与 `minimumReleaseAgeExclude: dsh-better-sidebar@0.17.1`（发布年龄策略豁免）；
- **better-sidebar 基线 0.17.1**：peer 依赖 `>=0.17.1`。自 0.17 起该包不再对独立 `cordis` 模块做 Context augmentation——client 半统一从**包根**导入 `Context`（`import type { Context } from 'dsh-better-sidebar'`，类型自带 `betterSidebar` 服务面）；`TabComponentProps` / `SidebarSettingsRenderProps` 仍从 `dsh-better-sidebar/client/service` 导入；
- **`@deepseek-ai/*` 均为可选 peer**（`dsh-host-webserver` / `cordis` / `react` / `react-dom`），运行时由 DSH 宿主解析，不进 bundle；
- **共享纯逻辑模块纪律**：`src/frame-settings.ts` 不带任何 import，host 与 client 两个 bundle 原样复用同一张 spec 表——loader schema、UI 面板输入、覆盖读取三者的范围 / 默认值永不漂移；client bundle 的纯度门（构建期拒绝 Node 内建与 `@deepseek-ai/*` 值导入）在 `tsdown.config.ts` 强制；
- **协议演进规范**：`PROTOCOL_VERSION` 常量位于 `src/cdp/protocol.ts` / `src/client/cdp-api.ts` 两端，消息形态用 zod `strict()` 锁死——新增命令 = 新判别成员，永不放松既有字段；
- **host 半改动需重启 `dsh web`** 后生效；client 半改动重建后硬刷新浏览器即可。

### 发布

npm 包名为 `dsh-sidebar-cdp-browser`（仓库：`chendefine/dsh-sidebar-cdp-browser`）：

```sh
# 1. 提升 package.json 版本，并同步所有引用该版本号的文档/注释
# 2. 构建 + 测试，然后发布（prepublishOnly 会再跑一次构建）
pnpm test && pnpm publish --access public
# 3. 打 tag 并推送发布
git tag v<version> && git push origin main --tags
```

### 已知限制

- 一个 target 同一时刻只支持一个消费中的 screencast 帧队列；
- Chromium 的启动与进程生命周期不由插件管理；
- target title 以 1s 轮询的命令快照为准，导航后有短暂延迟；
- 键盘：复制（Ctrl+C）暂不支持（需要读取远端选区，后续版本提供）；Touch、文件上传/下载、完整 DevTools 未实现；
- 未实现 `Page.captureScreenshot` 兼容回退；
- 远程、多用户、多 Host 部署需要外部认证、共享 ticket store 和更严格的网络策略。

## 许可证

MIT（见 [LICENSE](LICENSE)）。
