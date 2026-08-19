import type { Protocol } from 'puppeteer-core';

export type CdpEventHandler = (payload: unknown) => void;

export interface CdpSessionAdapter {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  on(event: string, handler: CdpEventHandler): void;
  off(event: string, handler: CdpEventHandler): void;
  detach(): Promise<void>;
}

export interface BrowserTargetAdapter {
  readonly type: string;
  readonly title: string;
  readonly url: string;
  createSession(): Promise<CdpSessionAdapter>;
  /** Close this target in the remote browser (lifecycle control, gated by the session's interactive mode). */
  close(): Promise<void>;
}

export interface BrowserAdapter {
  listTargets(): Promise<readonly BrowserTargetAdapter[]>;
  /**
   * Pull the CURRENT title/url of every target straight from the browser's
   * own state (a Target.getTargets command) into whatever backing store the
   * adapters' title/url getters read.
   *
   * Why this exists: Chromium does not EMIT title-only TargetInfo updates —
   * after a navigation commits, the real document title is only visible via
   * commands (verified against the live endpoint: getTargetInfo returns the
   * real title while the event-driven cache stays on the tentative one,
   * e.g. "baidu.com", forever). The poll/nudge layers call this before
   * re-reading the adapters.
   */
  refreshTargetInfo(): Promise<void>;
  /** Create a new page target (about:blank) in the default browser context. */
  createTarget(): Promise<BrowserTargetAdapter>;
  onTargetCreated(handler: (target: BrowserTargetAdapter) => void): void;
  offTargetCreated(handler: (target: BrowserTargetAdapter) => void): void;
  onTargetChanged(handler: (target: BrowserTargetAdapter) => void): void;
  offTargetChanged(handler: (target: BrowserTargetAdapter) => void): void;
  onTargetDestroyed(handler: (target: BrowserTargetAdapter) => void): void;
  offTargetDestroyed(handler: (target: BrowserTargetAdapter) => void): void;
  isConnected(): boolean;
  disconnect(): Promise<void>;
}

export type ScreencastFrameEvent = Protocol.Page.ScreencastFrameEvent;
