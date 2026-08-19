import { TargetController } from './target-controller.js';
import type { KeyInput, MouseInput, NavigateInput, NavigationResult, TargetKey, TextInput } from './types.js';

export class InputController {
  constructor(readonly targets: TargetController) {}

  async dispatchMouse(targetKey: TargetKey, input: MouseInput): Promise<void> {
    validateCoordinate(input.x, 'x');
    validateCoordinate(input.y, 'y');
    await this.targets.withSession(targetKey, async (session) => {
      await session.send('Input.dispatchMouseEvent', compact({
        type: input.type, x: input.x, y: input.y, button: input.button,
        buttons: input.buttons, clickCount: input.clickCount, deltaX: input.deltaX,
        deltaY: input.deltaY, modifiers: input.modifiers,
      }));
    });
  }

  async dispatchKey(targetKey: TargetKey, input: KeyInput): Promise<void> {
    if (!input.key && !input.code && !input.text && input.type !== 'keyUp') throw new Error('Key event requires key, code, or text');
    await this.targets.withSession(targetKey, async (session) => {
      await session.send('Input.dispatchKeyEvent', compact({ ...input }));
    });
  }

  async insertText(targetKey: TargetKey, input: TextInput | string): Promise<void> {
    const text = typeof input === 'string' ? input : input.text;
    await this.targets.withSession(targetKey, async (session) => {
      await session.send('Input.insertText', { text });
    });
  }

  async navigate(targetKey: TargetKey, input: NavigateInput | string): Promise<NavigationResult> {
    const request = typeof input === 'string' ? { url: input } : input;
    assertNavigationUrl(request.url);
    return this.targets.withSession(targetKey, async (session) => {
      await session.send('Page.enable');
      return session.send<NavigationResult>('Page.navigate', compact({ url: request.url, referrer: request.referrer }));
    });
  }

  async history(targetKey: TargetKey, action: 'back' | 'forward' | 'reload'): Promise<void> {
    await this.targets.withSession(targetKey, async (session) => {
      await session.send('Page.enable');
      if (action === 'reload') {
        await session.send('Page.reload', { ignoreCache: false });
        return;
      }
      const history = await session.send<{ currentIndex: number; entries: Array<{ id: number }> }>('Page.getNavigationHistory');
      const index = action === 'back' ? history.currentIndex - 1 : history.currentIndex + 1;
      const entry = history.entries[index];
      if (entry !== undefined) await session.send('Page.navigateToHistoryEntry', { entryId: entry.id });
    });
  }
}

function validateCoordinate(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

function assertNavigationUrl(value: string): void {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Navigation protocol is not allowed: ${url.protocol}`);
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
