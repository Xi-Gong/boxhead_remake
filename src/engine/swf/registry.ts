/**
 * Registries shared by the display list and the Player (lane E). Re-exported from Player.ts (the contract module);
 * kept separate so DisplayObject.ts can use them without an import cycle.
 */
import type { SoundInfo } from '../../shared/assetSchema.ts';
import type { DisplayObject, MovieClip } from './DisplayObject.ts';

/** Constructor type of a MovieClip subclass usable with registerClass. */
export type MovieClipClass = { prototype: MovieClip };

const classRegistry = new Map<string, MovieClipClass>();
/** AS2 Object.registerClass(linkage, Class). */
export function registerClass(linkage: string, cls: MovieClipClass): void { classRegistry.set(linkage, cls); }
export function getRegisteredClass(linkage: string): MovieClipClass | undefined { return classRegistry.get(linkage); }
/** Engine/tests: forget all registered classes. */
export function clearRegisteredClasses(): void { classRegistry.clear(); }

export type FrameScript = (this: MovieClip) => void;
const frameScripts = new Map<string, FrameScript>();
/** Register a ported DoAction frame script. spriteId 0 = root timeline; frame is 1-based. */
export function registerFrameScript(spriteId: number, frame: number, fn: FrameScript): void { frameScripts.set(`${spriteId}:${frame}`, fn); }
export function getFrameScript(spriteId: number, frame: number): FrameScript | undefined { return frameScripts.get(`${spriteId}:${frame}`); }
/** Engine/tests: forget all frame scripts. */
export function clearFrameScripts(): void { frameScripts.clear(); }

/**
 * Hook for hiding/replacing instances by scope rules (src/game/scope.ts) before their ctor runs.
 * Called for EVERY instance created from the library (MovieClips, Buttons, TextFields, Shapes...), after its frame-1
 * children exist and before its ctor(); `charId` is the library character id (-1 for createEmptyMovieClip etc.,
 * which do not call the hook). Use `instanceof MovieClip / Button` to filter. It runs when the tree is BUILT (children
 * before parents), i.e. before ANY constructor of that tree (constructors run parent first afterwards — oracle P11).
 */
export type InstanceHook = (mc: MovieClip, charId: number) => void;
let instanceHook: InstanceHook | undefined;
export function setInstanceHook(h: InstanceHook | undefined): void { instanceHook = h; }
export function getInstanceHook(): InstanceHook | undefined { return instanceHook; }

/**
 * StartSound handler (lane D / integration wires it to AudioEngine). Called when a timeline frame with StartSound
 * tags is executed (frame creation, timeline advance, or the TARGET frame of a goto — skipped frames do not play).
 * StartSounds whose envelope is entirely silent (the SWF's "preload all sounds" trick in sprite 565) are filtered out
 * by the engine and never reach the handler.
 */
export type TimelineSoundHandler = (charId: number, info: SoundInfo, clip: MovieClip) => void;
let soundHandler: TimelineSoundHandler | undefined;
export function setTimelineSoundHandler(h: TimelineSoundHandler | undefined): void { soundHandler = h; }
export function getTimelineSoundHandler(): TimelineSoundHandler | undefined { return soundHandler; }

/**
 * DefineButton2 condition actions (`on(release){...}` etc. compiled into the button character). Not ported by
 * default (this SWF only uses them for external links); integration may register a handler.
 * `cond` is the SWF ButtonCondAction bit mask of the event that fired (e.g. 8 = OverDownToOverUp = release).
 */
export type ButtonActionHandler = (button: DisplayObject, charId: number, actionIndex: number, cond: number) => void;
let buttonActionHandler: ButtonActionHandler | undefined;
export function setButtonActionHandler(h: ButtonActionHandler | undefined): void { buttonActionHandler = h; }
export function getButtonActionHandler(): ButtonActionHandler | undefined { return buttonActionHandler; }

/** Script error reporter (AS2 swallows errors; we log them and keep running). */
export type ScriptErrorHandler = (err: unknown, where: string) => void;
let scriptErrorHandler: ScriptErrorHandler = (err, where) => { console.error(`[swf] script error in ${where}:`, err); };
export function setScriptErrorHandler(h: ScriptErrorHandler): void { scriptErrorHandler = h; }
export function reportScriptError(err: unknown, where: string): void { scriptErrorHandler(err, where); }
