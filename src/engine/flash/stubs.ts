/**
 * Flash classes that exist in the AS2 code but have no function in the remake (network, IPC).
 * Kept as inert stubs so ported code runs unchanged. See src/game/deviations.ts.
 */

/** AS2 LoadVars — network requests are disabled; onLoad is never called. */
export class LoadVars {
  [key: string]: any;
  onLoad: ((success: boolean) => void) | undefined;
  sendAndLoad(_url: string, _target: unknown, _method?: string): boolean { return false; }
  send(_url: string, _window?: string, _method?: string): boolean { return false; }
  load(_url: string): boolean { return false; }
  toString(): string { return ''; }
}

/** AS2 LocalConnection — unused. */
export class LocalConnection {
  [key: string]: any;
  domain(): string { return 'localhost'; }
  allowDomain(..._d: string[]): boolean { return true; }
  connect(_name: string): boolean { return false; }
  send(..._args: unknown[]): boolean { return false; }
  close(): void {}
}

/** AS2 ContextMenuItem / ContextMenu — recorded so the HTML context menu (engine/platform/ContextMenu.ts) can show them. */
export class ContextMenuItem {
  caption: string;
  onSelect: ((obj: unknown, item: ContextMenuItem) => void) | undefined;
  separatorBefore: boolean;
  enabled: boolean;
  visible: boolean;
  constructor(caption: string, onSelect?: (obj: unknown, item: ContextMenuItem) => void, separatorBefore = false, enabled = true, visible = true) {
    this.caption = caption;
    this.onSelect = onSelect;
    this.separatorBefore = separatorBefore;
    this.enabled = enabled;
    this.visible = visible;
  }
}

export class ContextMenu {
  customItems: ContextMenuItem[] = [];
  builtInItems: Record<string, boolean> = {};
  onSelect: ((obj: unknown, menu: ContextMenu) => void) | undefined;
  constructor(onSelect?: (obj: unknown, menu: ContextMenu) => void) { this.onSelect = onSelect; }
  hideBuiltInItems(): void { for (const k of ['save', 'zoom', 'quality', 'play', 'loop', 'rewind', 'forward_back', 'print']) this.builtInItems[k] = false; }
}

/** AS2 System.security etc. */
export const SystemStub = { security: { allowDomain: (..._d: string[]): void => {} } };
