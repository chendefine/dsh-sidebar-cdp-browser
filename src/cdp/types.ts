import type { Protocol } from 'puppeteer-core';

export type Brand<T, Name extends string> = T & { readonly __brand: Name };

/** Public, unguessable identifier. It intentionally has no relation to a CDP target id. */
export type TargetKey = Brand<string, 'TargetKey'>;
export type LeaseId = Brand<string, 'LeaseId'>;

export type TargetLifecycleState = 'available' | 'attached' | 'closed';

export interface TargetDescriptor {
  key: TargetKey;
  type: string;
  title: string;
  url: string;
  lifecycle: TargetLifecycleState;
  attached: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ScreencastOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}

export interface ScreencastFrame {
  targetKey: TargetKey;
  sequence: number;
  data: string;
  metadata: Protocol.Page.ScreencastFrameEvent['metadata'];
  receivedAt: number;
}

export type MouseButton = 'none' | 'left' | 'middle' | 'right' | 'back' | 'forward';
export type MouseEventType = 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel';
export type KeyEventType = 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char';

export interface MouseInput {
  type: MouseEventType;
  x: number;
  y: number;
  button?: MouseButton;
  buttons?: number;
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  modifiers?: number;
}

export interface KeyInput {
  type: KeyEventType;
  key?: string;
  code?: string;
  text?: string;
  unmodifiedText?: string;
  windowsVirtualKeyCode?: number;
  nativeVirtualKeyCode?: number;
  modifiers?: number;
  autoRepeat?: boolean;
  isKeypad?: boolean;
  isSystemKey?: boolean;
  location?: number;
}

export interface TextInput {
  text: string;
}

export interface NavigateInput {
  url: string;
  referrer?: string;
}

export interface NavigationResult {
  frameId: string;
  loaderId?: string;
  errorText?: string;
}

export interface Lease {
  id: LeaseId;
  targetKey: TargetKey;
  owner: string;
  issuedAt: number;
  expiresAt: number;
}
