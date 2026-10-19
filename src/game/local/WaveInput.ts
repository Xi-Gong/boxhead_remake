import { Key } from '../../engine/runtime.ts';
import { engine } from '../../engine/swf/state.ts';
import type { Presenter } from '../../engine/platform/Presenter.ts';
import { BODY_FONT, GREY, INK, MENU_FONT, RED, panelCard, pillButton, text } from './UiStyle.ts';
import { validateWaveText } from './WaveValidation.ts';

let presenter: Presenter | undefined;
let stage: HTMLElement | undefined;
export function initWaveDom(p: Presenter, s: HTMLElement): void { presenter = p; stage = s; }
type Options = {
  screen: any; field: any; rect: { x: number; y: number; w: number; h: number };
  get: () => number; set: (n: number) => void; max: () => number;
  editable?: () => boolean; visible?: () => boolean;
};

/** Screen-owned text conduit: authored canvas font, native selection/paste/IME and a canvas modal. */
export class WaveInput {
  private readonly options: Options;
  private last: number;
  private dirty = false;
  private pastedRaw?: string;
  private composing = false;
  private visible = false;
  private disposed = false;
  private input?: HTMLInputElement;
  private unresize?: () => void;
  private releaseDom?: () => void;
  private modal: any;
  private modalText: any;
  private shield?: HTMLDivElement;
  private closeButton?: HTMLButtonElement;
  private baseFormat: any;

  constructor(options: Options) {
    this.options = options; this.last = options.get();
    this.baseFormat=options.field.getTextFormat();
    options.field.type = 'input';
    this.showValue(this.last);
    const previous = options.screen.onUnload;
    options.screen.onUnload = () => { this.dispose(); previous?.call(options.screen); };
  }
  private editable(): boolean { return this.options.editable?.() ?? true; }
  private showValue(n: number): void {
    this.last = n; this.dirty = false; this.pastedRaw = undefined;
    this.options.field.text = String(n);
    this.options.field.setTextFormat(this.baseFormat);
    if(this.options.field.textWidth>this.options.rect.w-6){
      const format=this.options.field.getTextFormat();format.size*= (this.options.rect.w-6)/this.options.field.textWidth;
      this.options.field.setTextFormat(format);
    }
    if (this.input) this.input.value = String(n);
  }
  refresh(): void {
    if (this.disposed) return;
    const show = this.options.screen.mNormal && (this.options.visible?.() ?? true);
    if (!this.dirty || !this.editable()) {
      if (this.last !== this.options.get()) this.showValue(this.options.get());
    }
    if (show !== this.visible) {
      this.visible = show;
      if (show) this.mount(); else this.unmount();
    }
    if (this.input) this.input.readOnly = !this.editable();
  }
  commit(): boolean {
    if (this.modal?._visible || this.composing) return false;
    if (!this.editable()) return true;
    // Test/other selection APIs may have changed the valid value while no DOM draft was being edited.
    if (!this.dirty && this.last !== this.options.get()) this.showValue(this.options.get());
    const result = validateWaveText(this.pastedRaw ?? this.input?.value ?? String(this.options.field.text), this.options.max());
    if (result.ok === false) { this.error(result.reason); return false; }
    if (result.value !== this.options.get()) this.options.set(result.value);
    this.showValue(result.value);
    return true;
  }
  cycle(delta: number): boolean {
    if (!this.editable() || !this.commit()) return false;
    const max = this.options.max(),m=BigInt(max);
    const next = Number(((BigInt(this.options.get())-1n+BigInt(delta))%m+m)%m+1n);
    this.options.set(next); this.showValue(next); return true;
  }
  cancel(): void { this.composing = false; this.showValue(this.options.get()); }
  focus(): void { this.input?.focus({preventScroll:true}); this.input?.select(); }
  private caret = (): void => {
    if (!this.input || !this.editable()) return;
    engine.focus = this.options.field;
    engine.caretIndex = this.input.selectionStart ?? this.input.value.length;
    engine.caretT0 = performance.now();
  };
  private mount(): void {
    if (!stage || !presenter || typeof document === 'undefined') return;
    const input = this.input = document.createElement('input');
    input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Start wave'); input.spellcheck = false;
    input.value = String(this.options.field.text); input.readOnly = !this.editable();
    input.style.cssText = 'position:absolute;display:none;background:transparent;color:transparent;caret-color:transparent;'
      + 'border:none;outline:none;padding:0;box-sizing:border-box;text-align:center;z-index:7;font-family:Arial,sans-serif';
    input.addEventListener('input', () => { this.pastedRaw = undefined; this.dirty = true; this.options.field.text = input.value; this.caret(); });
    input.addEventListener('paste', e => {
      if (!this.editable() || !e.clipboardData) return;
      // Text inputs strip CR/LF. Keep the raw paste for validation so "1\n0" can never turn into valid "10".
      e.preventDefault();
      const start=input.selectionStart??0,end=input.selectionEnd??start,raw=this.pastedRaw??input.value;
      this.pastedRaw=raw.slice(0,start)+e.clipboardData.getData('text/plain')+raw.slice(end);
      input.value=this.pastedRaw.replace(/[\r\n]/g,' '); this.options.field.text=input.value;
      const caret=start+e.clipboardData.getData('text/plain').length;input.setSelectionRange(caret,caret);
      this.dirty=true;this.caret();
    });
    input.addEventListener('compositionstart', () => { this.composing = true; });
    input.addEventListener('compositionend', () => { this.composing = false; });
    input.addEventListener('focus', () => { Key._clear(); this.caret(); });
    input.addEventListener('blur', () => {
      if (engine.focus === this.options.field) engine.focus = null;
      if (this.visible && !this.modal?._visible) this.commit();
    });
    for (const name of ['keyup', 'select', 'click'] as const) input.addEventListener(name, this.caret);
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (this.composing || e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') { e.preventDefault(); this.cancel(); input.select(); }
      if (e.key === 'Enter') { e.preventDefault(); this.commit(); }
    });
    // Validate before Pointer focuses the canvas and dispatches the same press to a game control.
    const outside = (e: PointerEvent): void => {
      if (this.modal?._visible || document.activeElement !== input || e.target === input) return;
      if (!this.commit()) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    const modalKey = (e: KeyboardEvent): void => {
      if (!this.modal?._visible) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'keydown' && !e.isComposing && (e.key === 'Enter' || e.key === 'Escape')) this.dismiss();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', modalKey, true); document.addEventListener('keyup', modalKey, true);
    this.releaseDom = () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', modalKey, true); document.removeEventListener('keyup', modalKey, true);
    };
    stage.appendChild(input); this.unresize = presenter.onResize(this.place); this.place();
  }
  private place = (): void => {
    if (!presenter || !stage) return;
    const put = (el: HTMLElement | undefined, r: {x:number;y:number;w:number;h:number}): void => {
      if (!el) return;
      const a = presenter!.contentToClient(r.x,r.y), b = presenter!.contentToClient(r.x+r.w,r.y+r.h), s=stage!.getBoundingClientRect();
      Object.assign(el.style,{left:`${a.x-s.left}px`,top:`${a.y-s.top}px`,width:`${b.x-a.x}px`,height:`${b.y-a.y}px`,fontSize:`${(b.y-a.y)*.65}px`});
    };
    put(this.input,this.options.rect);
    if (this.input) this.input.style.display = this.modal?._visible ? 'none' : 'block';
    put(this.closeButton,{x:235,y:346,w:170,h:28});
  };
  private error(reason: string): void {
    if (!this.modal) {
      const s = this.options.screen;
      this.modal = s.createEmptyMovieClip('_WaveError',s.getNextHighestDepth());
      const card = panelCard(this.modal);
      text(card,'_Title',-215,-110,430,32,MENU_FONT,24,RED,false,'center','INVALID WAVE');
      this.modalText = text(card,'_Reason',-210,-32,420,75,BODY_FONT,18,INK,false,'center','',true);
      text(card,'_Hint',-210,60,420,24,BODY_FONT,13,GREY,false,'center','Close to edit your entry.');
      const close = pillButton(card,'_Close',0,120,170,28,'CLOSE',14);
      close.onRelease = () => this.dismiss();
    }
    this.modalText.text = `${reason}\nAllowed range: 1 - ${this.options.max()}.`;
    this.modal._visible = true; Key._clear();
    if (stage && !this.shield) {
      this.shield = document.createElement('div');
      this.shield.setAttribute('role','dialog'); this.shield.setAttribute('aria-label','Invalid wave');
      this.shield.setAttribute('aria-modal','true');
      this.shield.style.cssText = 'position:absolute;inset:0;z-index:8';
      for (const event of ['pointerdown','pointerup','pointermove','click','wheel'] as const)
        this.shield.addEventListener(event,e=>e.stopPropagation());
      this.closeButton = document.createElement('button'); this.closeButton.setAttribute('aria-label','Close wave error');
      this.closeButton.style.cssText = 'position:absolute;opacity:0;cursor:pointer';
      this.closeButton.addEventListener('click',()=>this.dismiss());
      this.shield.appendChild(this.closeButton); stage.appendChild(this.shield);
    }
    this.place(); this.closeButton?.focus({preventScroll:true});
  }
  private dismiss(): void {
    if (this.modal) this.modal._visible = false;
    this.shield?.remove(); this.shield = undefined; this.closeButton = undefined;
    this.place(); this.input?.focus({preventScroll:true}); this.input?.select();
  }
  private unmount(): void {
    this.visible = false; this.composing = false;
    this.unresize?.(); this.unresize = undefined; this.releaseDom?.(); this.releaseDom = undefined;
    if (this.modal) this.modal._visible = false;
    this.shield?.remove(); this.shield = undefined; this.closeButton = undefined;
    this.input?.remove(); this.input = undefined;
    if (engine.focus === this.options.field) engine.focus = null;
  }
  dispose(): void { this.disposed = true; this.unmount(); }
}
