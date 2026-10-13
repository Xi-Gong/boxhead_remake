/**
 * Right-click menu mirroring Flash Player's custom context menu (`_root.menu`).   OWNER: lane D (platform)
 *
 *     const menu = attachContextMenu({ container: presenter.container, onOpenChange: (o) => loop.setPaused(o) });
 *
 * Flash behaviour reproduced:
 *   - On right-click the menu's own onSelect(obj, menu) runs first, then the visible custom items are listed
 *     (separatorBefore -> separator line, enabled:false -> greyed). Choosing an item calls item.onSelect(obj, item)
 *     (CContextMenu's handlers flip the save flag and rewrite item.caption, which the next opening shows).
 *   - The movie freezes while the menu is open (the classic "right-click to pause"): wire onOpenChange to
 *     Loop.setPaused. Keys are released when it opens.
 * Remake extra (below a separator): "Render: 2x / 1x" -> SaveStore.renderScale (applies on next level load/restart).
 * The browser's own context menu is always suppressed on the stage.
 */
import { Key } from '../flash/input.ts';
import type { ContextMenu as AS2ContextMenu, ContextMenuItem } from '../flash/stubs.ts';
import { _root } from '../swf/Player.ts';
import { SaveStore } from './SaveStore.ts';

export interface ContextMenuOptions {
  /** Element whose right-clicks open the menu (the stage container). */
  container: HTMLElement;
  /** The AS2 menu to show; default `_root.menu`. */
  getMenu?: () => AS2ContextMenu | undefined;
  /** `obj` passed to onSelect handlers; default `_root`. */
  getTarget?: () => unknown;
  /** Called when the menu opens/closes (pause the Loop like Flash does). */
  onOpenChange?: (open: boolean) => void;
  /** Show the remake's "Render: Nx" item (default true). */
  renderItem?: boolean;
}

/** One row as displayed (pure, tested). */
export interface MenuRow { caption: string; enabled: boolean; separatorBefore: boolean; select: () => void }

/** Builds the rows Flash would show for an AS2 ContextMenu (visible custom items only), plus remake extras. */
export function buildMenuRows(menu: AS2ContextMenu | undefined, target: unknown, extras: MenuRow[] = []): MenuRow[] {
  const rows: MenuRow[] = [];
  for (const item of (menu?.customItems ?? []) as ContextMenuItem[]) {
    if (!item || item.visible === false) continue;
    rows.push({
      caption: String(item.caption ?? ''),
      enabled: item.enabled !== false,
      separatorBefore: !!item.separatorBefore && rows.length > 0,
      select: () => item.onSelect?.call(item, target, item),
    });
  }
  extras.forEach((x, i) => rows.push({ ...x, separatorBefore: rows.length > 0 && (i === 0 || x.separatorBefore) }));
  return rows;
}

export function renderScaleRow(): MenuRow {
  return {
    caption: `Render: ${SaveStore.renderScale}x`,
    enabled: true,
    separatorBefore: true,
    select: () => { SaveStore.renderScale = SaveStore.renderScale === 2 ? 1 : 2; },
  };
}

const STYLE_ID = 'bx-ctxmenu-style';
const CSS = `
.bx-ctxmenu{position:fixed;z-index:1000;min-width:150px;padding:2px 0;background:#fff;border:1px solid #a0a0a0;
  box-shadow:2px 2px 3px rgba(0,0,0,.35);font:12px "Segoe UI",Tahoma,Arial,sans-serif;color:#000;cursor:default;
  user-select:none;-webkit-user-select:none;outline:none}
.bx-ctxmenu-item{padding:3px 24px 3px 26px;white-space:nowrap;line-height:16px}
.bx-ctxmenu-item.on:hover{background:#91c9f7}
.bx-ctxmenu-item.off{color:#8d8d8d}
.bx-ctxmenu-sep{height:1px;margin:3px 1px;background:#d7d7d7}
`;

export class ContextMenuOverlay {
  private el: HTMLDivElement | undefined;
  private readonly opts: ContextMenuOptions;

  constructor(opts: ContextMenuOptions) {
    this.opts = opts;
    opts.container.addEventListener('contextmenu', this.onContextMenu);
  }

  get isOpen(): boolean { return this.el !== undefined; }

  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    this.open(e.clientX, e.clientY);
  };

  open(clientX: number, clientY: number): void {
    this.close(false);
    const target = this.opts.getTarget ? this.opts.getTarget() : _root;
    const menu = this.opts.getMenu ? this.opts.getMenu() : (_root as unknown as { menu?: AS2ContextMenu } | undefined)?.menu;
    try { menu?.onSelect?.call(menu, target, menu); } catch (err) { console.error('[contextmenu] onSelect', err); }
    const rows = buildMenuRows(menu, target, this.opts.renderItem === false ? [] : [renderScaleRow()]);
    if (rows.length === 0) return;

    injectStyle();
    const el = document.createElement('div');
    el.className = 'bx-ctxmenu';
    el.setAttribute('role', 'menu');
    el.tabIndex = -1;
    for (const r of rows) {
      if (r.separatorBefore) {
        const sep = document.createElement('div');
        sep.className = 'bx-ctxmenu-sep';
        el.appendChild(sep);
      }
      const it = document.createElement('div');
      it.className = `bx-ctxmenu-item ${r.enabled ? 'on' : 'off'}`;
      it.setAttribute('role', 'menuitem');
      if (!r.enabled) it.setAttribute('aria-disabled', 'true');
      it.textContent = r.caption;
      if (r.enabled) {
        it.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.close();
          try { r.select(); } catch (err) { console.error('[contextmenu] item', err); }
        });
      }
      el.appendChild(it);
    }
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
    el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    document.body.appendChild(el);
    // Clamp inside the viewport (native menus flip at the edges).
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = clientX + w > window.innerWidth ? Math.max(0, clientX - w) : clientX;
    const y = clientY + h > window.innerHeight ? Math.max(0, clientY - h) : clientY;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.el = el;
    Key._clear();
    window.addEventListener('pointerdown', this.onOutside, true);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onBlur);
    this.opts.onOpenChange?.(true);
  }

  close(notify = true): void {
    if (!this.el) return;
    this.el.remove();
    this.el = undefined;
    window.removeEventListener('pointerdown', this.onOutside, true);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onBlur);
    if (notify) this.opts.onOpenChange?.(false);
  }

  private readonly onOutside = (e: PointerEvent): void => {
    if (this.el && e.target instanceof Node && this.el.contains(e.target)) return;
    // A right-click elsewhere on the stage re-opens via the contextmenu event that follows.
    this.close();
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
  };

  private readonly onBlur = (): void => this.close();

  dispose(): void {
    this.close();
    this.opts.container.removeEventListener('contextmenu', this.onContextMenu);
  }
}

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function attachContextMenu(opts: ContextMenuOptions): ContextMenuOverlay {
  return new ContextMenuOverlay(opts);
}
