# dsh-sidebar-cdp-browser

[中文](./README.zh-CN.md) · [npm](https://www.npmjs.com/package/dsh-sidebar-cdp-browser) · [GitHub](https://github.com/chendefine/dsh-sidebar-cdp-browser)

A [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) sidebar tab for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) that live-projects an **external Chromium** into the DSH Web GUI as a JPEG pixel stream, and sends back keyboard/mouse actions through a **strictly allow-listed** command protocol. The target page is **never** embedded as an iframe — the host process owns the only CDP connection, so the browser side never learns the CDP address and can issue no arbitrary CDP passthrough.

![npm](https://img.shields.io/npm/v/dsh-sidebar-cdp-browser) ![license](https://img.shields.io/npm/l/dsh-sidebar-cdp-browser) ![node](https://img.shields.io/node/v/dsh-sidebar-cdp-browser)

## Screenshot

![Configuring the CDP address and the interactive-input switch in the settings page](dsh_plugin_config_cdp.png)

![The CDP live view in the DSH Web sidebar](dsh_sidebar_view_cdp.png)

```
DSH Web (browser)                    DSH host process                   external Chromium
┌──────────────────┐   POST /dsh-cdp-live/api/open   ┌──────────────┐
│ sidebar tab      │  ────────────────────────────►  │ one-time     │
│ (React + Canvas) │   ◄──── ticket (TTL 30s) ──────  │ 256-bit ticket│
│                  │                                 │              │   the only CDP
│ renders JPEG ◄───┼── WS /sidebar/ws/cdp-live ──────┼─ puppeteer ──┼──► :9222
 │                 │   frame meta JSON + JPEG bytes  │  -core       │   (screencast
 └─│──────────────┘                                 └──────────────┘    + Input)
   └ allow-listed commands (zod strict discriminated union; no CDP passthrough)
```

- Package: [dsh-sidebar-cdp-browser on npm](https://www.npmjs.com/package/dsh-sidebar-cdp-browser)
- Source: [chendefine/dsh-sidebar-cdp-browser on GitHub](https://github.com/chendefine/dsh-sidebar-cdp-browser)
- Version: 0.1.1
- License: MIT
- Platform: web (the DSH Web GUI)
- Depends on: [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) ≥ 0.17.1 (a **required peer**)
- Tests: 87 cases / 17 spec files (one is an opt-in probe against a real Chromium, skipped by default)

## Features

**The live view**

- Registers the「CDP 实时视图」(CDP live view) tab (id `dsh-sidebar-cdp-browser:live`) in the better-sidebar sidebar, rendering the remote page as a live pixel stream on a canvas (`Page.startScreencast` JPEG frames; contain-fit scaling, devicePixelRatio-aware drawing);
- A top tab strip lists every page target: switch, create, close (titles come from the `Target.getTargets` snapshot, polled at 1s);
- The toolbar offers address-bar navigation (type an HTTP(S) URL and press Enter / back / forward / reload) and a manual reconnect; after a drop the client reconnects with automatic backoff;
- Hiding the tab or collapsing the panel stops the frame stream automatically (better-sidebar's `visible` gating) and resumes on return;
- Copy is bilingual (zh/en) and follows the DSH host language preference (dictionaries register with the locale service; the browser language is only the pre-service fallback); known host-side close reasons display localized too, and the loader config fields carry zh/en descriptions.

**Controlled interaction**

- Mouse: click, drag, wheel — coordinates map back onto the page through the frame geometry; keyboard: click the canvas to claim focus, then type; IME (Chinese et al.) commits once through composition, paste is forwarded as text insertion through the local clipboard (copy / Ctrl+C is not supported yet);
- Everything the client can send is one **zod `strict()` discriminated union** (`src/cdp/protocol.ts`) — target lifecycle, screencast start/stop, `Input.dispatch*`, `Page.navigate` / `history`, ping — with **no `{method, params}`-shaped CDP passthrough of any kind**;
- Interaction sits behind a **two-level gate** (see [Usage](#the-two-level-control-gate)): the "interactive input" master setting plus the header's "keyboard & mouse control" checkbox; only with both open does a view run in interactive mode, and the host enforces the ticket's mode — an unauthorized (even forged) client cannot emit a single control command.

**The settings panel**

- "Settings → side card → sidebar content → CDP实时视图" gear popup: the CDP address, the interactive-input master switch, and four frame-capture knobs (quality / interval / max width × height);
- The CDP address is configured in the web UI and persisted (in better-sidebar's prefs document) — no loader-config edits; on save the host drops the old connection and the live view reconnects to the new address by itself;
- Frame knobs support per-field UI overrides (winning over the loader config); out-of-range or junk stored values are silently dropped by the host, falling back to safe values.

## Use cases

- **Remote / headless Chromium visualization**: the browser runs on a server or in a container; you watch and click from the DSH UI;
- **Watching browser automation inside a DSH session**: keep an eye on an agent-driven browser in real time and take over at any moment;
- **A lightweight VNC substitute**: browser-only "remote desktop" with zero client installs;
- **Controlled demos / debugging**: project a test browser to colleagues — navigation and clicks stay inside the permission model;
- The pixel-stream + gated-input model is a natural fit for "projecting" one browser session to many observers, or supervising the operator of an AI session.

## Installation

### Prerequisites

- A DSH host (Web GUI, `web` profile) on Node.js ≥ 20;
- [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) ≥ 0.17.1 — a **required peer**: this plugin's tab is registered through it and will not appear without it (install both with the one-liner below);
- A started Chromium CDP endpoint reachable from the DSH host process, e.g.:

  ```sh
  chromium \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port=9222
  ```

### The plugin itself

The package ships a `dsh.bundle.patch` (`cordis.patch.yml`: one insert row mounting the host-half entry). From the npm registry (prebuilt — no build permission needed) — one command installs the framework and this plugin together:

```sh
dsh plugin --profile web add dsh-better-sidebar dsh-sidebar-cdp-browser
```

From the GitHub repository (source — pnpm runs the `prepare` build):

```sh
dsh plugin --profile web add dsh-better-sidebar github:chendefine/dsh-sidebar-cdp-browser
```

Or through the DSH plugin marketplace (设置 → DSH插件市场) — tag the repo with the `dsh-plugin` topic and it is indexed automatically.

> pnpm may block native-dependency builds of better-sidebar (e.g. `node-pty`); add the named package to `allowBuilds` in the profile's `pnpm-workspace.yaml` as prompted and re-run.

After the plugin joins the profile layer stack, **restart `dsh web`** for it to load; uninstall with `dsh plugin --profile web remove dsh-sidebar-cdp-browser` and restart again.

## Usage

### Configuring the CDP address

The address is configured **in the DSH web settings page**, not in the profile array:

1. Open **settings → side card → sidebar content → CDP实时视图** and click the card's gear;
2. Fill the「CDP 地址」field; blur or press Enter to save;
3. **Empty = the default `127.0.0.1:9222`**;
4. Accepted formats:
   - `host:port` (auto-prefixed with `http://`) or `http://host:port`: the host discovers the `webSocketDebuggerUrl` via `/json/version`;
   - `https://` / `wss://`: same, TLS is the deployment's concern;
   - `ws://.../devtools/browser/...`: connect to the browser WebSocket directly;
5. On save the host drops the old connection and open live views reconnect to the new address.

The address persists in better-sidebar's prefs document (`pluginSettings['dsh-sidebar-cdp-browser:live'].endpoint`), read and subscribed through the DSH settings service. There is **no loopback restriction** — remote addresses work as-is; make sure of reachability and access control yourself.

### The two-level control gate

The panel's "interactive input" master switch combines with the view header's "keyboard & mouse control" checkbox into a two-level gate:

- **Interactive input OFF (default)**: observe mode — view only; the header checkbox is **greyed out and unchecked**;
- **Interactive input ON**: control is allowed, but the checkbox still **starts unchecked** (still view-only); check「键盘鼠标远程控制」left of the「已连接」label in the view header to make that view truly interactive (clicks, typing, navigation, tab create/close); unchecking returns it to observe instantly.

The checkbox **does not persist**: a page refresh or panel reopen resets it unchecked (safe by default). Any switch change reconnects the view in the new mode, and the host enforces the ticket's mode — an unauthorized, even forged, client cannot emit control commands.

### Daily operation

- **Keyboard & mouse control**: the header checkbox left of「已连接」(see above);
- **Targets — switch / create / close**: the top tab strip, interactive mode required;
- **Mouse**: click, drag, wheel, coordinates mapped through the frame geometry;
- **Keyboard**: click the canvas to claim focus, then type. IME commits once via composition; paste is forwarded as text through the local clipboard; **copy (Ctrl+C) is not supported yet**;
- **Navigation**: type an HTTP(S) URL in the toolbar and press Enter, or use back / forward / reload;
- **Connection**: manual reconnect in the toolbar; automatic backoff reconnect after drops.

### Loader runtime tuning (optional)

Optional fields in the profile config (all omittable; parentheses hold defaults and ranges). The four `frame*` fields double as the **deployment defaults** of the web-UI settings — a field changed in the UI wins:

```yaml
- insert:
    - id: sidebar-cdp-browser
      name: dsh-sidebar-cdp-browser
      config:
        frameQuality: 60        # JPEG quality (20–90)
        frameMaxWidth: 1280     # max frame width (320–3840)
        frameMaxHeight: 900     # max frame height (240–2160)
```

| Field                     | Default | Range                              |
| ------------------------- | ------- | ---------------------------------- |
| `ticketTtlMs`             | 30000   | 5000–120000, one-time ticket TTL   |
| `connectTimeoutMs`        | 15000   | 1000–120000, CDP connect timeout   |
| `frameQuality`            | 60      | 20–90, JPEG quality                |
| `frameMaxWidth`           | 1280    | 320–3840                           |
| `frameMaxHeight`          | 900     | 240–2160                           |
| `frameEveryNth`           | 1       | 1–30, keep 1 of every N frames     |
| `bufferedAmountSoftLimit` | 524288  | 64KB–16MB, frame dropping starts   |
| `bufferedAmountHardLimit` | 4194304 | 256KB–64MB, connection cut         |

### Frame knobs in the web UI

The four frame-capture parameters (`frameQuality` / `frameEveryNth` / `frameMaxWidth` / `frameMaxHeight`) can also be adjusted **directly in the web-UI gear popup**, besides the loader config:

- The popup matches the other "sidebar content" feature settings (row cards + switches + numeric inputs); width × height share one row;
- Untouched fields display the **effective value** (loader config; the code default when unavailable); a saved edit writes the prefs document as that field's explicit override;
- **UI overrides beat the loader config** (per field): only edited fields are written, the rest keep the loader values; out-of-range or junk stored values are silently dropped by the host, falling back to the loader values;
- On save the host disconnects live views with `1012` and they reconnect automatically; the new parameters apply at the next `Page.startScreencast` after the reconnect;
- The panel reads effective values through the read-only route `GET /dsh-cdp-live/api/config` (equally trust-fenced).

Note: `frameMaxWidth` / `frameMaxHeight` are only **projection caps** (post-capture downscale bounds); they never affect the page's real layout size — pages always render at the remote Chromium window's true viewport (the plugin connects with an explicit `defaultViewport: null` and never overrides the viewport).

### Troubleshooting

Refused WebSocket upgrades return explicit HTTP statuses; the browser console shows `Unexpected response code: <status>`:

| Status | Meaning | Fix |
| ------ | ------- | --- |
| 401 | ticket invalid or expired | The client re-runs `/open` for a fresh ticket automatically; if persistent, check the session is still alive |
| 403 | trust fence refusal (Host header not trusted, or cross-site marker) | Behind a reverse proxy, verify the proxy forwards the correct Host header |
| 404 | wrong path / session not found | Check the route path and session id |
| 1006 (no status) | the request died at the reverse-proxy tier | The proxy must forward WebSocket upgrade headers (below) |
| 1011 (app close) | CDP connection / attach failure | Check the DSH host log (below) |
| 1012 (app close) | settings change (address / frame params) — expected | The client reconnects automatically |
| 1013 (app close) | slow client exceeded the hard backpressure limit | Auto-reconnects once the network recovers; raise `bufferedAmount*Limit` or lower quality if frequent |

nginx WebSocket forwarding reference:

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

CDP connection failures log `[dsh-sidebar-cdp-browser] CDP session attach failed: ...` in the DSH host log — the browser only sees the disconnect, so start debugging there.

## Architecture

### The two halves

A DSH plugin has a host (node) half and a browser half; this plugin's split:

```text
┌──────────────── DSH host process ─────────────┐      ┌── Chromium ──┐
│  host half (src/index.ts)                     │      │              │
│  ├─ POST /dsh-cdp-live/api/open  ── issue ticket│     │  CDP :9222   │
│  ├─ GET  /dsh-cdp-live/api/config── frame params│     │  (screencast │
│  ├─ WS   /sidebar/ws/cdp-live    ── the protocol│    │   + Input)   │
│  └─ EndpointManager → puppeteer-core ────────────────┤              │
└───────────────────────────────────────────────┘      └──────────────┘
         ▲ ticket + binary frames (JSON meta + JPEG)   ┌── browser ───┐
         │                                            │ client half  │
         └────────────────────────────────────────────┤ canvas render │
              mouse/keyboard/navigation — allow-listed (zod) commands ┘
```

- The **host half** (`src/`, injects `webServer` / `sessions` / `webRuntime`): registers the HTTP and WebSocket routes, keeps the single CDP connection alive through puppeteer-core, subscribes to the DSH settings service for the UI's address and frame overrides, and hot-swaps the connection on settings commits;
- The **client half** (`src/client/`, the tab registered via `dsh-better-sidebar`): React components, canvas rendering, input events translated into the restricted commands.

### The connection handshake

```text
POST /dsh-cdp-live/api/open        → trust fence + DSH session check
                                   → one-time 256-bit ticket (TTL 30s by default)
GET  /dsh-cdp-live/api/config      → trust fence; effective frame params (loader ∪ UI overrides)
WS   /sidebar/ws/cdp-live?ticket=… → trust fence + one-time ticket consumption
                                   → 101, then the versioned protocol (v: 1)
```

- The client never learns the CDP address or any credentials — the connection and target ids are ephemeral state inside the host process;
- The ticket binds the session and the mode (observe / interactive) and dies after one use;
- The upgrade request **does not require Origin**: common DSH reverse-proxy setups rewrite Host to loopback and drop Origin, so admission rides the trust fence (Host + cross-site markers) plus the one-time ticket.

### The frame pipeline & backpressure

```text
Page.startScreencast (JPEG; quality/size/sampling = loader config ∪ web-UI overrides, UI per-field wins)
  → the host ACKs each Page.screencastFrame immediately (decoupled from downstream)
  → LatestFrameQueue        single-slot latest-frame queue: producers never block, new frames evict old
  → ws.send(frameMeta JSON) metadata (sequence / mimeType / byteLength …)
  → ws.send(JPEG bytes)     the binary frame right behind
  → client canvas draw
```

Two backpressure tiers keyed off `ws.bufferedAmount`:

- past the **soft limit** (512KB default): frames are dropped, not sent — the picture stales slightly, the connection stays healthy;
- past the **hard limit** (4MB default): disconnect with `1013` so a slow client can't pile up memory without bound.

### The command protocol

Versioned (`v: 1`, a zod `strict()` discriminated union, `src/cdp/protocol.ts`); the client's commands:

- `targets.list` / `targets.create` / `target.select` / `target.detach` / `target.close`
- `visibility` (frame-stream toggle for tab hide/restore)
- `screencast.start` / `screencast.stop` (options: format / quality / maxWidth / maxHeight / everyNthFrame)
- `input.mouse` / `input.key` / `input.text`
- `navigate` (http(s) URLs only) / `history` (back / forward / reload)
- `ping`

The server's `ready` / `response` / `targets.changed` / `target.closed` / `frame` / `error` messages are equally strict schemas; unknown fields are always rejected.

### Connection & lease management

- **EndpointManager**: one implicit CDP connection identified by a generation; an address change in settings → the host listens on `settings/document-updated` → drops the old connection, bounces clients with `1012` → the clients' backoff loop lands on the new address; `http(s)` addresses discover the `webSocketDebuggerUrl` via `/json/version`, `ws(s)` addresses connect directly; timeout and retries are tunable;
- **LeaseManager**: a target's screencast frame queue has exactly one consumer at a time; switching targets releases the old lease first;
- **TargetRegistry**: target discovery, switching and destruction notices (titles from the `Target.getTargets` snapshot polled at 1s; the real document title after navigation is fetched through the same command).

### Security boundary

The CDP capabilities open by default: target lifecycle, screencast start/stop/ack, `Input.dispatch*`, `Page.navigate` / `Page.reload` / navigation history.

Interactive commands (keyboard/mouse, navigation, tab management) sit behind the two-level gate: the "interactive input" setting (master) + the header's "keyboard & mouse control" checkbox (per view at runtime, unchecked by default). Only with both open is a session established in interactive mode; the host enforces the ticket's mode and blocks every control command otherwise.

Deliberately **not** open:

- `Runtime.evaluate`;
- cookies / storage / network;
- downloads, uploads, permission grants;
- arbitrary CDP method passthrough;
- the DevTools frontend.

Two notes:

1. The CDP address is configured from the web UI and the host applies **no loopback restriction** — any session that can open that settings page can make the DSH host dial arbitrary addresses; expose the settings page only in trusted environments;
2. The trust fence defends against cross-site requests and DNS rebinding; it **is not user authentication** — a keyless DSH should be used as a single-user local tool only.

### Repository layout

```text
src/
├── index.ts              # host-half entry: route registration, settings subscription, hot swap (inject: webServer, sessions, webRuntime)
├── config.ts             # config schema (schemastery + zod twins) & endpoint normalization (covered via endpoint-config, 4 tests)
├── frame-settings.ts     # the single frame-spec table: ranges/defaults/override reads/merge (pure, shared host+client) (6 tests)
├── trust-fence.ts        # host/cross-site trust decision (5 tests via cdp-security)
├── routes/
│   ├── http.ts           # /open + /config routes + the one-time ticket registry
│   └── websocket.ts      # the WS upgrade route (trust fence + ticket admission + 401/403/404 refusals)
├── cdp/
│   ├── live-session.ts   # session orchestration: attach, command dispatch, frame pump, 1012/1013 lifecycle
│   ├── endpoint-manager.ts / browser-connection-manager.ts / puppeteer-adapter.ts   # the single CDP connection (9 tests via cdp-manager)
│   ├── screencast-controller.ts / frame-queue.ts    # capture & the single-slot latest-frame queue (3 tests)
│   ├── input-controller.ts / target-controller.ts / target-registry.ts
│   ├── lease-manager.ts  # exclusive per-target lease
│   └── protocol.ts       # the versioned zod protocol (4 tests)
└── client/               # the better-sidebar tab (React + canvas + input bridges)
    ├── index.tsx         # browser-half entry: register tab + settings panel (ctx.effect)
    ├── SidebarCdpBrowser.tsx  # view assembly: settings / socket / target store
    ├── use-cdp-socket.ts      # WS client: ticket fetch, backoff reconnect, binary frames
    ├── use-target-store.ts    # target state
    ├── LiveCanvas.tsx         # canvas + IME sink + keyboard ownership
    ├── input-bridge.ts        # mouse bridge + capture-phase keyboard bridge (7+5+3 tests)
    ├── frame-renderer.ts      # ImageBitmap rendering (contain fit + DPR)
    ├── geometry.ts            # contain-fit coordinate mapping (3 tests)
    ├── TargetTabStrip.tsx / BrowserToolbar.tsx / ConnectionToolbar.tsx / StatusOverlay.tsx   # the chrome components (13 tests)
    ├── settings.tsx           # the gear settings panel: address / interactive switch / frame rows (10 tests)
    ├── i18n.ts                # locale wiring: register zh/en dicts + t() (follows the DSH preference) + close-reason localization
    └── locales.ts             # zh/en dictionaries (key sets enforced equal, 5 tests)
tests/                    # vitest: 87 cases / 17 files (live-probe is the opt-in real-Chromium probe; live-wiring spins real loopback HTTP/WS servers; client-bundle verifies the built artifact's identity & purity)
cordis.patch.yml          # the bundle channel's host-half insert row (mount declaration)
tsdown.config.ts          # dual-bundle build (host ESM + client ModuleLoader format + purity gate + CSS inlining)
pnpm-workspace.yaml       # pnpm ≥ 11-only settings (allowBuilds / minimumReleaseAgeExclude)
lib/                      # build outputs (lib/index.js host ESM; lib/client.js client bundle; lib/types declarations)
```

Build outputs: the host half is a plain ESM bundle (`puppeteer-core` / `ws` / `zod` ship with the package); the browser half is a `window.__ModuleLoader__.load({ id, factory })` registration bundle (the official external client-plugin delivery format) with React / cordis external and a **purity gate** that rejects Node builtins and `@deepseek-ai/*` value imports — `tests/client-bundle.spec.ts` verifies the built artifact's identity and browser purity after every build.

## Development notes

### Build & test

```sh
git clone https://github.com/chendefine/dsh-sidebar-cdp-browser && cd dsh-sidebar-cdp-browser
pnpm install       # install (prepare builds once)
pnpm typecheck     # tsc --noEmit
pnpm test          # build + vitest run (82 cases)
pnpm build         # rm -rf lib && tsc declarations + tsdown dual bundle → lib/
```

The real-Chromium probe: `CDP_PROBE=1 pnpm vitest run tests/live-probe.spec.ts` (override the address with `CDP_PROBE_ENDPOINT`).

### Environment & conventions

- **pnpm ≥ 11**: pnpm-specific settings are read **only** from `pnpm-workspace.yaml` (same-named `.npmrc` keys are silently ignored). This repo pins `allowBuilds.node-pty: false` there (better-sidebar's optional native dep is types-only; its build never runs) and `minimumReleaseAgeExclude: dsh-better-sidebar@0.17.1` (a release-age policy exemption);
- **better-sidebar baseline 0.17.1**: the peer range is `>=0.17.1`. Since 0.17 the package no longer augments the standalone `cordis` module's Context — the client half imports `Context` from the **package root** (`import type { Context } from 'dsh-better-sidebar'`; the type already carries the `betterSidebar` service face); `TabComponentProps` / `SidebarSettingsRenderProps` still come from `dsh-better-sidebar/client/service`;
- **`@deepseek-ai/*` are all optional peers** (`dsh-host-webserver` / `cordis` / `react` / `react-dom`), resolved by the DSH host at runtime and never bundled;
- **Shared-pure-module discipline**: `src/frame-settings.ts` carries zero imports and is reused verbatim by both bundles as the single spec table — loader schema, UI panel inputs and override reads can never drift apart on ranges/defaults; the client bundle's purity gate (build-time rejection of Node builtins and `@deepseek-ai/*` value imports) is enforced in `tsdown.config.ts`;
- **Protocol evolution**: the `PROTOCOL_VERSION` constant lives on both ends (`src/cdp/protocol.ts` / `src/client/cdp-api.ts`) and message shapes are locked with zod `strict()` — adding a command means adding a union member, never loosening an existing field;
- **Host-half changes** take effect after a `dsh web` restart; client-half changes need a rebuild plus a browser hard refresh.

### Publishing

The npm package is `dsh-sidebar-cdp-browser` (repo: `chendefine/dsh-sidebar-cdp-browser`):

```sh
# 1. bump package.json's version, syncing every doc/comment that cites it
# 2. build + test, then publish (prepublishOnly re-runs the build)
pnpm test && pnpm publish --access public
# 3. tag & push the release
git tag v<version> && git push origin main --tags
```

### Known limits

- One consuming screencast frame queue per target at a time;
- Chromium's launch and process lifecycle are outside the plugin's scope;
- Target titles follow the 1s-polled command snapshot — a short lag after navigation;
- Keyboard: copy (Ctrl+C) is not supported yet (needs reading the remote selection; a later release); touch, file upload/download and the full DevTools are unimplemented;
- No `Page.captureScreenshot` compatibility fallback;
- Remote, multi-user, multi-host deployments need external authentication, a shared ticket store and stricter network policies.

## License

MIT (see [LICENSE](LICENSE)).
