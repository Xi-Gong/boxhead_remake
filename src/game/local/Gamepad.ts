// LOCAL gamepad support (deviation GAMEPAD_INPUT): the original game has none. The engine layer
// (engine/platform/Gamepad.ts) polls the pads once per rAF; this translator turns pad state into the game's own
// inputs, so everything downstream (movement, 8-direction aiming, fire, weapon cycling, pause) is the unmodified
// keyboard code path:
//   - pad 0 drives player 1's CInput slots, pad 1 player 2's (in Single player pad 1 also drives player 1);
//     v0.1.4: the assignment is swappable (swapAssignment, driven by the input badge's pad chips);
//   - buttons are translated to each slot's CURRENT keycode, re-read every poll, so user rebinding is respected and
//     the CInput recreation per world (State_LoadWorld) is picked up automatically;
//   - a pushedByPad set reconciles with the physical keyboard: the pad only releases keys it pushed itself, and
//     after Key._clear() (window blur / context menu) the next poll re-pushes still-held buttons;
//   - left stick (radial 40/30 % engage-release + eight even 22.5-degree sectors, v0.1.7) or the d-pad = movement;
//   - RT/LT or A held = FIRE, RB/LB = next/previous weapon, Start = pause (all through the slot latch semantics,
//     exactly like the keyboard keys they impersonate);
//   - menus / pause screen: pad 0's stick or d-pad moves a virtual cursor (player.mouseMove in stage-logical
//     coordinates, so renderScale does not matter), A presses / releases the mouse; the physical mouse always wins
//     (the cursor snaps to its position as soon as it moves);
//   - the first pad button dismisses the browser "Click to start" audio overlay (gamepads fire no DOM events).
import { dismissAudioOverlay } from '../../engine/platform/AudioEngine.ts';
import { GamepadWatcher, navigatorPadProvider, STICK_DEADZONE, type PadDirs, type PadPoll, type PadProvider } from '../../engine/platform/Gamepad.ts';
import { STAGE_H, STAGE_W } from '../../engine/platform/Presenter.ts';
import { Key, Mouse } from '../../engine/flash/input.ts';
import { CMain, World } from '../packages.ts';

/** Standard-mapping button indices used by the mapping. */
const BTN = { A: 0, LB: 4, RB: 5, LT: 6, RT: 7, START: 9 } as const;

/** Virtual cursor speed in logical pixels per poll (d-pad, or a fully deflected stick). */
const CURSOR_SPEED = 8;
/** The DOM cursor hides after this much pad inactivity (ms). */
const CURSOR_TIMEOUT = 3000;

export interface GamepadMousePlayer {
  mouseMove(x: number, y: number): void;
  mouseDown(): void;
  mouseUp(): void;
}

export interface GamepadOptions {
  player: GamepadMousePlayer;
  /** The platform mouse handle: its last physical position wins over the pad cursor. */
  mouse?: { readonly x: number; readonly y: number };
  /** Presenter + container enable the DOM cursor arrow (browser / Electron; omitted in tests). */
  presenter?: { logicalToClient(x: number, y: number): { x: number; y: number } };
  container?: HTMLElement;
  /** Pad snapshots for tests (default: navigator.getGamepads, absent in Node). */
  provider?: PadProvider;
}

/** One pad as the input badge sees it. */
export interface PadStatus {
  /** Navigator pad slot (0 / 1). */
  index: 0 | 1;
  /** The pad's name (Gamepad.id), when known. */
  id?: string;
  present: boolean;
  /** Date.now() of the last activity on this pad (0 = never). */
  lastActive: number;
  /** The player this pad currently drives (mode-aware: in Single player every pad drives player 1). */
  player: 0 | 1;
}

/** Input-badge state (v0.1.4): pad presence / names / activity + the pad->player assignment. */
export interface GamepadStatus {
  pads: [PadStatus, PadStatus];
  /** Pad slot -> player (default [0, 1] = automatic by navigator index; swap with swapAssignment). */
  assign: [0 | 1, 0 | 1];
  /** Date.now() of the last keyboard activity (0 = never). */
  keyboardActive: number;
}

export interface GamepadHandle {
  /** Call once per rAF (Loop's beforeTick) with the blocked state of the loop. */
  poll(blocked: boolean): void;
  /** The input badge reads this every redraw. */
  status(): GamepadStatus;
  /** Swap which player each pad drives (the badge's manual re-connect; releases held pad keys first). */
  swapAssignment(): void;
  dispose(): void;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function installGamepad(opts: GamepadOptions): GamepadHandle {
  const provider = opts.provider ?? navigatorPadProvider();
  const watchers: [GamepadWatcher, GamepadWatcher] = [new GamepadWatcher(provider, 0), new GamepadWatcher(provider, 1)];
  /** Accumulated button holds per pad slot (the engine reports edges; holds are what the game keys need). */
  const held: [Set<number>, Set<number>] = [new Set(), new Set()];
  const pushedByPad = new Set<number>();
  let cursorX = STAGE_W / 2;
  let cursorY = STAGE_H / 2;
  let lastMouseX = -1;
  let lastMouseY = -1;
  let mouseIsDown = false;
  let lastPadActivity = 0;
  let overlayDismissed = false;
  let cursorEl: HTMLElement | undefined;
  /** Pad slot -> player (v0.1.4; default automatic by navigator index). */
  const assign: [0 | 1, 0 | 1] = [0, 1];
  const padPresent: [boolean, boolean] = [false, false];
  const padIds: [string | undefined, string | undefined] = [undefined, undefined];
  const padActive: [number, number] = [0, 0];
  let keyboardActive = 0;
  const onKeydown = (e: Event): void => { keyboardActive = Date.now(); };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKeydown, true);

  const releaseAll = (): void => {
    for (const vk of [...pushedByPad]) {
      if (Key.isDown(vk)) Key._up(vk);
      pushedByPad.delete(vk);
    }
    if (mouseIsDown) {
      opts.player.mouseUp();
      mouseIsDown = false;
    }
  };

  /** Reconcile one wanted key state with Key, never fighting the physical keyboard. */
  const setKey = (slotLatch: { mKeycode: number } | undefined, want: boolean): void => {
    const vk = slotLatch?.mKeycode;
    if (typeof vk !== 'number' || !(vk >= 0 && vk <= 255)) return;
    const is = Key.isDown(vk);
    if (want && !is) {
      Key._down(vk);
      pushedByPad.add(vk);
    } else if (!want && is && pushedByPad.has(vk)) {
      Key._up(vk);
      pushedByPad.delete(vk);
    }
    // want && is && !pushedByPad: the physical keyboard holds it - leave it be. A keyboard _up while the pad still
    // wants it is picked up by the next poll (want && !is -> _down again); self-healing after Key._clear() too.
  };

  const mapPad = (slot: 0 | 1, p: PadPoll): void => {
    for (const b of p.down) held[slot].add(b);
    for (const b of p.up) held[slot].delete(b);
    // An absent pad must not map at all: with its directions all false it would immediately "release" whatever
    // the other pad pushed (they can share slots - pad 1 also drives player 1 in Single player).
    if (!p.present) {
      held[slot].clear();
      return;
    }
    const input = (CMain as any)?.mInput as Record<string, { mKeycode: number } | undefined> | undefined;
    if (!input) return;
    // Pad 1 drives player 2 outside Single player (player 2 does not exist there); the v0.1.4 assignment
    // override decides which pad that is (swapAssignment).
    const postfix = assign[slot] === 0 || World.CWorld.mGameMode === 'Single' ? '' : '2';
    const h = held[slot]!;
    const dirs = {
      left: p.stick.left || p.dpad.left,
      right: p.stick.right || p.dpad.right,
      up: p.stick.up || p.dpad.up,
      down: p.stick.down || p.dpad.down,
    } satisfies PadDirs;
    setKey(input['KEY_LEFT' + postfix], dirs.left);
    setKey(input['KEY_RIGHT' + postfix], dirs.right);
    setKey(input['KEY_UP' + postfix], dirs.up);
    setKey(input['KEY_DOWN' + postfix], dirs.down);
    setKey(input['KEY_FIRE' + postfix], h.has(BTN.RT) || h.has(BTN.LT) || h.has(BTN.A));
    setKey(input['KEY_NEXT_WEAPON' + postfix], h.has(BTN.RB));
    setKey(input['KEY_PREV_WEAPON' + postfix], h.has(BTN.LB));
    setKey(input.KEY_PAUSE, h.has(BTN.START));
  };

  const moveCursor = (p: PadPoll): void => {
    // The physical mouse wins: snap the pad cursor to its position as soon as it moved.
    let snapped = false;
    if (opts.mouse && (opts.mouse.x !== lastMouseX || opts.mouse.y !== lastMouseY)) {
      lastMouseX = opts.mouse.x;
      lastMouseY = opts.mouse.y;
      cursorX = opts.mouse.x;
      cursorY = opts.mouse.y;
      snapped = true;
    }
    let dx = 0;
    let dy = 0;
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    if (Math.abs(ax) > STICK_DEADZONE) dx = ax * CURSOR_SPEED;
    if (Math.abs(ay) > STICK_DEADZONE) dy = ay * CURSOR_SPEED;
    if (p.dpad.left) dx = -CURSOR_SPEED;
    if (p.dpad.right) dx = CURSOR_SPEED;
    if (p.dpad.up) dy = -CURSOR_SPEED;
    if (p.dpad.down) dy = CURSOR_SPEED;
    if (dx || dy) {
      cursorX = clamp(cursorX + dx, 0, STAGE_W);
      cursorY = clamp(cursorY + dy, 0, STAGE_H);
    }
    if (p.present && (dx || dy || p.down.size || p.up.size)) lastPadActivity = Date.now();
    // A = click: press on the down edge, release on the up edge (the engine fires onRelease only when the
    // pointer is still over the pressed button, like a real mouse).
    if (p.down.has(BTN.A)) {
      opts.player.mouseMove(cursorX, cursorY);
      opts.player.mouseDown();
      mouseIsDown = true;
    }
    if (p.up.has(BTN.A)) {
      opts.player.mouseMove(cursorX, cursorY);
      opts.player.mouseUp();
      mouseIsDown = false;
    }
    if (dx || dy || snapped || p.down.size || p.up.size) opts.player.mouseMove(cursorX, cursorY);
    // The pad arrow mirrors the OS cursor (GAME_CURSOR_HIDE, v0.1.8): while the world runs the OS arrow is
    // hidden, so the pad arrow must be too - otherwise it slides over the gameplay with every stick move.
    updateCursorDom(Mouse._visible && p.present && Date.now() - lastPadActivity < CURSOR_TIMEOUT);
  };

  const updateCursorDom = (visible: boolean): void => {
    if (typeof document === 'undefined' || !opts.presenter || !opts.container) return;
    if (visible && !cursorEl) {
      cursorEl = document.createElement('div');
      cursorEl.style.cssText = 'position:absolute;width:0;height:0;border-left:14px solid #fff;'
        + 'border-top:7px solid transparent;border-bottom:7px solid transparent;filter:drop-shadow(0 0 2px #000);'
        + 'pointer-events:none;z-index:9';
      opts.container.appendChild(cursorEl);
    }
    if (!visible && cursorEl) {
      cursorEl.remove();
      cursorEl = undefined;
      return;
    }
    if (cursorEl) {
      const c = opts.presenter.logicalToClient(cursorX, cursorY);
      const r = opts.container.getBoundingClientRect();
      cursorEl.style.left = c.x - r.left + 'px';
      cursorEl.style.top = c.y - r.top + 'px';
    }
  };

  /** v0.1.4 input badge: presence / names / last activity per pad slot (called once per poll). */
  const stamp = (slot: 0 | 1, p: PadPoll): void => {
    padPresent[slot] = p.present;
    if (p.id) padIds[slot] = p.id;
    if (p.present && (p.down.size || p.up.size || p.stick.left || p.stick.right || p.stick.up || p.stick.down
      || p.dpad.left || p.dpad.right || p.dpad.up || p.dpad.down)) padActive[slot] = Date.now();
  };

  return {
    poll(blocked: boolean): void {
      if (blocked) {
        releaseAll();
        return;
      }
      const p0 = watchers[0].poll();
      const p1 = watchers[1].poll();
      stamp(0, p0);
      stamp(1, p1);
      // The first pad button anywhere dismisses the audio-unlock overlay (gamepads fire no DOM events).
      if (!overlayDismissed && (p0.down.size || p1.down.size)) {
        overlayDismissed = true;
        dismissAudioOverlay();
      }
      mapPad(0, p0);
      mapPad(1, p1);
      moveCursor(p0);
    },
    status(): GamepadStatus {
      const mode = (World as any).CWorld?.mGameMode;
      const one = (slot: 0 | 1): PadStatus => ({
        index: slot,
        id: padIds[slot],
        present: padPresent[slot],
        lastActive: padActive[slot],
        player: assign[slot] === 0 || mode === 'Single' ? 0 : 1,
      });
      return { pads: [one(0), one(1)], assign: [assign[0], assign[1]], keyboardActive };
    },
    swapAssignment(): void {
      releaseAll(); // the held keys belong to the old player now
      const t = assign[0];
      assign[0] = assign[1];
      assign[1] = t;
    },
    dispose(): void {
      releaseAll();
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown, true);
      if (cursorEl) {
        cursorEl.remove();
        cursorEl = undefined;
      }
    },
  };
}
