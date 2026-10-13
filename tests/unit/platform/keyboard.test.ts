import { describe, expect, it } from 'vitest';
import { CODE_TO_VK, flashAscii, flashKeyCode, shouldPreventDefault } from '../../../src/engine/platform/Keyboard.ts';
import { flashWheelDelta } from '../../../src/engine/platform/Pointer.ts';
import { Key, Mouse } from '../../../src/engine/flash/input.ts';

const ev = (keyCode: number, code: string, key = '', mods: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) =>
  ({ keyCode, code, key, ...mods });

describe('DOM -> Flash virtual key codes', () => {
  it('game default keys (CSaveData defaults) map 1:1', () => {
    expect(flashKeyCode(ev(38, 'ArrowUp'))).toBe(38);
    expect(flashKeyCode(ev(40, 'ArrowDown'))).toBe(40);
    expect(flashKeyCode(ev(37, 'ArrowLeft'))).toBe(37);
    expect(flashKeyCode(ev(39, 'ArrowRight'))).toBe(39);
    expect(flashKeyCode(ev(191, 'Slash', '/'))).toBe(191);
    expect(flashKeyCode(ev(190, 'Period', '.'))).toBe(190);
    expect(flashKeyCode(ev(188, 'Comma', ','))).toBe(188);
    expect(flashKeyCode(ev(87, 'KeyW', 'w'))).toBe(87);
    expect(flashKeyCode(ev(32, 'Space', ' '))).toBe(32);
    expect(flashKeyCode(ev(80, 'KeyP', 'p'))).toBe(80);
    expect(flashKeyCode(ev(27, 'Escape', 'Escape'))).toBe(27);
  });

  it('physical-code fallback table (keyCode 0 / 229 IME) covers every CInput.mValidKeys entry', () => {
    const valid = [38, 40, 37, 39, 111, 106, 109, 107, 110, ...Array.from({ length: 10 }, (_, i) => 96 + i),
      ...Array.from({ length: 26 }, (_, i) => 65 + i), 32, 188, 190, 191, 220, 189, 187, 46, 36, 35, 33, 34, 45,
      186, 192, 222, 219, 221];
    const values = new Set(Object.values(CODE_TO_VK));
    for (const vk of valid) expect(values.has(vk), `vk ${vk}`).toBe(true);
    expect(flashKeyCode(ev(0, 'Slash'))).toBe(191);
    expect(flashKeyCode(ev(229, 'KeyA'))).toBe(65);
    expect(flashKeyCode(ev(0, 'Numpad5'))).toBe(101);
    expect(flashKeyCode(ev(0, 'NumpadDivide'))).toBe(111);
    expect(flashKeyCode(ev(0, 'F11'))).toBe(122);
    expect(flashKeyCode(ev(0, 'Unidentified'))).toBe(0);
  });

  it('OEM punctuation uses Windows VK codes (Gecko codes fixed up)', () => {
    expect(flashKeyCode(ev(186, 'Semicolon', ';'))).toBe(186);
    expect(flashKeyCode(ev(59, 'Semicolon', ';'))).toBe(186);
    expect(flashKeyCode(ev(61, 'Equal', '='))).toBe(187);
    expect(flashKeyCode(ev(173, 'Minus', '-'))).toBe(189);
    expect(flashKeyCode(ev(222, 'Quote', "'"))).toBe(222);
    expect(flashKeyCode(ev(219, 'BracketLeft', '['))).toBe(219);
    expect(flashKeyCode(ev(221, 'BracketRight', ']'))).toBe(221);
    expect(flashKeyCode(ev(192, 'Backquote', '`'))).toBe(192);
    expect(flashKeyCode(ev(220, 'Backslash', '\\'))).toBe(220);
  });

  it('numpad keys keep their own codes', () => {
    for (let i = 0; i <= 9; i++) expect(flashKeyCode(ev(96 + i, `Numpad${i}`, String(i)))).toBe(96 + i);
    expect(flashKeyCode(ev(106, 'NumpadMultiply', '*'))).toBe(106);
    expect(flashKeyCode(ev(107, 'NumpadAdd', '+'))).toBe(107);
    expect(flashKeyCode(ev(109, 'NumpadSubtract', '-'))).toBe(109);
    expect(flashKeyCode(ev(110, 'NumpadDecimal', '.'))).toBe(110);
    expect(flashKeyCode(ev(111, 'NumpadDivide', '/'))).toBe(111);
  });

  it('getAscii: produced character, control keys, 0 otherwise', () => {
    expect(flashAscii({ key: 'a' })).toBe(97);
    expect(flashAscii({ key: 'A' })).toBe(65);
    expect(flashAscii({ key: '/' })).toBe(47);
    expect(flashAscii({ key: ' ' })).toBe(32);
    expect(flashAscii({ key: 'Enter' })).toBe(13);
    expect(flashAscii({ key: 'Backspace' })).toBe(8);
    expect(flashAscii({ key: 'Escape' })).toBe(27);
    expect(flashAscii({ key: 'ArrowUp' })).toBe(0);
    expect(flashAscii({ key: 'Shift' })).toBe(0);
  });

  it('preventDefault for game keys, not for F-keys / Alt / Ctrl combos', () => {
    expect(shouldPreventDefault(ev(32, 'Space', ' '))).toBe(true);
    expect(shouldPreventDefault(ev(191, 'Slash', '/'))).toBe(true);
    expect(shouldPreventDefault(ev(222, 'Quote', "'"))).toBe(true);
    expect(shouldPreventDefault(ev(9, 'Tab', 'Tab'))).toBe(true);
    expect(shouldPreventDefault(ev(38, 'ArrowUp', 'ArrowUp'))).toBe(true);
    expect(shouldPreventDefault(ev(122, 'F11', 'F11'))).toBe(false);
    expect(shouldPreventDefault(ev(123, 'F12', 'F12'))).toBe(false);
    expect(shouldPreventDefault(ev(115, 'F4', 'F4', { altKey: true }))).toBe(false);
    expect(shouldPreventDefault(ev(13, 'Enter', 'Enter', { altKey: true }))).toBe(false);
    expect(shouldPreventDefault(ev(82, 'KeyR', 'r', { ctrlKey: true }))).toBe(false);
    expect(shouldPreventDefault(ev(17, 'ControlLeft', 'Control', { ctrlKey: true }))).toBe(true);
  });

  it('wheel: +3 per notch up, -3 down (Flash on Windows)', () => {
    expect(flashWheelDelta(-100)).toBe(3);
    expect(flashWheelDelta(53)).toBe(-3);
    expect(flashWheelDelta(0)).toBe(0);
  });
});

describe('AS2 Key / Mouse broadcasting', () => {
  it('isDown, getCode after down/up, auto-repeat re-broadcasts onKeyDown, _clear releases silently', () => {
    Key._reset();
    const log: string[] = [];
    const l = { onKeyDown() { log.push(`d${Key.getCode()}`); }, onKeyUp() { log.push(`u${Key.getCode()}`); } };
    Key.addListener(l);
    Key.addListener(l); // no duplicates
    Key._down(191, 47);
    Key._down(191, 47); // auto-repeat
    expect(Key.isDown(191)).toBe(true);
    expect(Key.getAscii()).toBe(47);
    Key._up(191, 47);
    expect(Key.isDown(191)).toBe(false);
    Key._down(37);
    Key._clear();
    expect(Key.isDown(37)).toBe(false);
    expect(log).toEqual(['d191', 'd191', 'u191', 'd37']);
    expect(Key.getCode()).toBe(37);
    Key._reset();
  });

  it('a listener removing itself during broadcast makes the next one skip (AsBroadcaster live indexing)', () => {
    Key._reset();
    const log: string[] = [];
    const a = { onKeyDown() { log.push('a'); Key.removeListener(a); } };
    const b = { onKeyDown() { log.push('b'); } };
    const c = { onKeyDown() { log.push('c'); } };
    Key.addListener(a); Key.addListener(b); Key.addListener(c);
    Key._down(65);
    expect(log).toEqual(['a', 'c']);
    log.length = 0;
    Key._down(65);
    expect(log).toEqual(['b', 'c']);
    Key._reset();
  });

  it('listener added during broadcast is not called in that broadcast', () => {
    Key._reset();
    const log: string[] = [];
    const late = { onKeyDown() { log.push('late'); } };
    Key.addListener({ onKeyDown() { log.push('first'); Key.addListener(late); } });
    Key._down(27);
    expect(log).toEqual(['first']);
    Key._reset();
  });

  it('Mouse listeners, wheel delta and show/hide return values', () => {
    Mouse._reset();
    const log: string[] = [];
    const l = { onMouseDown() { log.push('down'); }, onMouseUp() { log.push('up'); }, onMouseWheel(d: number) { log.push(`w${d}`); } };
    Mouse.addListener(l);
    Mouse._dispatch('onMouseDown');
    Mouse._dispatch('onMouseMove');
    Mouse._dispatch('onMouseUp');
    Mouse._dispatchWheel(3);
    expect(log).toEqual(['down', 'up', 'w3']);
    expect(Mouse.hide()).toBe(1);
    expect(Mouse._visible).toBe(false);
    expect(Mouse.hide()).toBe(0);
    expect(Mouse.show()).toBe(0);
    expect(Mouse.show()).toBe(1);
    Mouse._reset();
  });
});
