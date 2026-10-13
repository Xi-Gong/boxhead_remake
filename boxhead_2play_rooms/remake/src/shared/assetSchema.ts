/**
 * Asset contract between the build-time extractor (tools/) and the runtime (src/engine, src/game).
 *
 * Produced by `npm run extract` from boxhead_2play_rooms.swf into public/assets/:
 *   library.json   LibraryJson (all characters, timelines, exports, class registrations)
 *   xsi.json       XsiJson     (Softimage XSI character data evaluated from sprite 755's DoAction)
 *   bitmaps/<id>.png|jpg, sounds/<id>.mp3
 *
 * Units & conventions (apply everywhere unless stated otherwise):
 *   - Lengths/coordinates are in Flash pixels (twips / 20), as floating point numbers.
 *   - Matrices use Flash order {a,b,c,d,tx,ty}: x' = a*x + c*y + tx, y' = b*x + d*y + ty (tx/ty in px).
 *   - Colors are [r, g, b, a] with every component 0..255.
 *   - Character ids are the SWF character ids (numbers); JSON object keys are their decimal strings.
 *   - Frame numbers are 1-based (as in AS2 gotoAndStop); arrays of frames are 0-based (index = frame-1).
 *   - Angles in filters are radians (as stored in the SWF), distances/blur in px.
 *
 * This file must stay type-only (no runtime code) so tools can `import type` it under Node type stripping.
 */

export interface Mat { a: number; b: number; c: number; d: number; tx: number; ty: number }

/** Color transform. Multipliers are fractions (SWF value / 256, 1 = identity); offsets are -255..255 (SWF value). */
export interface CX { rm: number; gm: number; bm: number; am: number; ra: number; ga: number; ba: number; aa: number }

export type RGBA = [number, number, number, number];

export interface Rect { xMin: number; yMin: number; xMax: number; yMax: number }

// ---------------------------------------------------------------- fills & lines

export interface GradStop { r: number /* ratio 0..255 */; c: RGBA }

export type FillStyle =
  | { t: 'solid'; c: RGBA }
  /**
   * Gradients: `m` maps gradient space to shape space (px). Gradient space is the SWF gradient square
   * x,y ∈ [-16384, 16384] (linear: color varies along x; radial: distance from origin, 16384 = ratio 255).
   * (i.e. the SWF gradient matrix with all six components divided by 20.)
   */
  | { t: 'linear' | 'radial' | 'focal'; m: Mat; spread: 'pad' | 'reflect' | 'repeat'; interp: 'rgb' | 'linear'; stops: GradStop[]; focal?: number }
  /** Bitmap fill: `m` maps bitmap pixel space to shape space (px) (SWF matrix with all components / 20). */
  | { t: 'bitmap'; bitmapId: number; m: Mat; repeat: boolean; smooth: boolean };

export interface LineStyle {
  /** Stroke width in px; 0 means hairline (always 1 device pixel). */
  w: number;
  /** Solid color (LineStyle1, or LineStyle2 without fill). */
  c?: RGBA;
  /** LineStyle2 fill (gradient/bitmap stroke). */
  fill?: FillStyle;
  /** LineStyle2 options. LineStyle1 => round caps & joins. */
  startCap?: 'round' | 'none' | 'square';
  endCap?: 'round' | 'none' | 'square';
  join?: 'round' | 'bevel' | 'miter';
  miter?: number;
  noHScale?: boolean;
  noVScale?: boolean;
  pixelHinting?: boolean;
  noClose?: boolean;
}

// ---------------------------------------------------------------- shapes

/**
 * One style "layer" of a shape. A new layer starts at every StateNewStyles record; later layers draw on top.
 * `fills[i].s` indexes `fillStyles`, `strokes[i].s` indexes `lineStyles` (0-based within this layer).
 * Paths are SVG path data in px (M/L/Q/Z only). Fill paths are complete closed contours, to be filled
 * with the even-odd rule. Draw order inside a layer: all fills (array order), then all strokes (array order).
 */
export interface ShapeLayer {
  fillStyles: FillStyle[];
  lineStyles: LineStyle[];
  fills: { s: number; d: string }[];
  strokes: { s: number; d: string }[];
}

export interface ShapeDef {
  t: 'shape';
  id: number;
  /** DefineShape version 1..4 */
  ver: number;
  /** ShapeBounds (includes stroke widths) */
  bounds: Rect;
  /** DefineShape4 EdgeBounds (geometry only) */
  edgeBounds?: Rect;
  layers: ShapeLayer[];
}

/**
 * DefineMorphShape(2). Start/end styles are paired. Paths are a shared command string ('M','L','Q','Z' one
 * char per command) with flat coordinate arrays for start (`a`) and end (`b`) geometry:
 * M,L take 2 numbers, Q takes 4 (control x,y, anchor x,y), Z takes 0.
 */
export interface MorphLayer {
  fillStyles: [FillStyle, FillStyle][];
  lineStyles: [LineStyle, LineStyle][];
  fills: { s: number; cmd: string; a: number[]; b: number[] }[];
  strokes: { s: number; cmd: string; a: number[]; b: number[] }[];
}

export interface MorphDef {
  t: 'morph';
  id: number;
  ver: number;
  startBounds: Rect;
  endBounds: Rect;
  layers: MorphLayer[];
}

// ---------------------------------------------------------------- filters

interface FilterBase { passes: number /* quality */ }

export type Filter =
  | (FilterBase & { t: 'blur'; blurX: number; blurY: number })
  | (FilterBase & {
      t: 'dropShadow'; color: RGBA; blurX: number; blurY: number; angle: number; distance: number;
      strength: number; inner: boolean; knockout: boolean; hideObject: boolean /* = !compositeSource */;
    })
  | (FilterBase & { t: 'glow'; color: RGBA; blurX: number; blurY: number; strength: number; inner: boolean; knockout: boolean })
  | (FilterBase & {
      /**
       * Bevel. `highlight` is the FIRST color stored in the SWF record and `shadow` the second
       * (decision recorded in tools/swf/records.ts; verify against Flash Player output).
       */
      t: 'bevel'; highlight: RGBA; shadow: RGBA; blurX: number; blurY: number; angle: number; distance: number;
      strength: number; inner: boolean; knockout: boolean; onTop: boolean;
    })
  | (FilterBase & {
      t: 'gradientGlow' | 'gradientBevel'; colors: RGBA[]; ratios: number[]; blurX: number; blurY: number; angle: number;
      distance: number; strength: number; inner: boolean; knockout: boolean; onTop: boolean;
    })
  | { t: 'colorMatrix'; m: number[] /* 20 floats, Flash order (row-major 4x5, offsets in 0..255 units) */ }
  | {
      t: 'convolution'; matrixX: number; matrixY: number; divisor: number; bias: number; m: number[];
      color: RGBA; clamp: boolean; preserveAlpha: boolean;
    };

// ---------------------------------------------------------------- timelines

export interface PlaceOp {
  op: 'place';
  depth: number;
  /** PlaceObject2 "move" flag: modify the existing object at `depth` (if `id` is also set: replace character). */
  move: boolean;
  /** Character id, when placing a new character (or replacing). */
  id?: number;
  name?: string;
  m?: Mat;
  cx?: CX;
  /** Morph ratio 0..65535 */
  ratio?: number;
  /** Mask: this object masks depths (depth, clipDepth]. */
  clipDepth?: number;
  filters?: Filter[];
  /** SWF blend mode number (0/1 = normal). */
  blend?: number;
  cacheAsBitmap?: boolean;
  /** True when the PlaceObject carried clip actions (bytecode not exported; see actions report). */
  hasClipActions?: boolean;
  /** PlaceObject3 class name (unused in SWF8 content but kept). */
  className?: string;
}

export interface RemoveOp { op: 'remove'; depth: number }

export type TimelineOp = PlaceOp | RemoveOp;

export interface SoundInfo {
  stop?: boolean;
  noMultiple?: boolean;
  inPoint?: number;
  outPoint?: number;
  loops?: number;
  envelope?: { pos44: number; left: number; right: number }[];
}

export interface FrameDef {
  /** Display list operations in tag order. */
  ops: TimelineOp[];
  /** StartSound tags in this frame. */
  sounds?: { id: number; info: SoundInfo }[];
  /** Indices into LibraryJson.actions of DoAction tags in this frame (order preserved). */
  actions?: number[];
}

export interface SpriteDef {
  t: 'sprite';
  id: number;
  frameCount: number;
  frames: FrameDef[];
  /** label -> 1-based frame number */
  labels: Record<string, number>;
}

// ---------------------------------------------------------------- bitmaps, sounds

export interface BitmapDef {
  t: 'bitmap';
  id: number;
  w: number;
  h: number;
  /** Path relative to the assets root, e.g. "bitmaps/409.png". */
  file: string;
  format: 'png' | 'jpg';
  /** True if the bitmap carries an alpha channel (Lossless2 / JPEG3). */
  alpha: boolean;
}

export interface SoundDef {
  t: 'sound';
  id: number;
  /** Path relative to the assets root, e.g. "sounds/539.mp3". */
  file: string;
  format: 'mp3' | 'pcm' | 'adpcm';
  rate: number;
  stereo: boolean;
  sampleCount: number;
}

// ---------------------------------------------------------------- fonts & text

export interface FontGlyph {
  /** Unicode code point (DefineFont3 code table). */
  code: number;
  /** Advance in EM units where 1 EM = 1024 (DefineFont3 values / 20). */
  adv: number;
  /** Glyph outline, SVG path in EM units (1024 per EM, y down, baseline at 0). Fill with nonzero rule. */
  d: string;
  /** Glyph bounds in EM units (if present in the SWF). */
  bounds?: Rect;
}

export interface FontDef {
  t: 'font';
  id: number;
  ver: number;
  name: string;
  bold: boolean;
  italic: boolean;
  smallText: boolean;
  /** Metrics in EM units (1024 per EM). Absent when the font has no layout table. */
  ascent?: number;
  descent?: number;
  leading?: number;
  /** Glyph table, index = glyph index used by DefineText records. */
  glyphs: FontGlyph[];
  /** [code1, code2, adjustment(EM units)] */
  kerning?: [number, number, number][];
  /** DefineFontAlignZones (FlashType grid-fitting data), when the SWF has one for this font. */
  alignZones?: FontAlignZones;
}

/**
 * DefineFontAlignZones (tag 73): FlashType alignment zones (tools/swf/text.ts parseDefineFontAlignZones).
 * Values are EM units (1024 per EM, like glyph paths) measured from the glyph origin, y UP from the baseline.
 */
export interface FontAlignZones {
  /** CSMTableHint: 0 thin, 1 medium, 2 thick (selects Flash's CSM cutoff table). */
  hint: number;
  /**
   * One entry per glyph (index = glyph index): the record's four FLOAT16 values in file order, or null when its zone
   * masks are 0 (the space glyph). In this SWF they are [x, y, xRange, yRange]: x = left edge of the first vertical
   * stem, y = 0 (baseline), xRange = distance to the left edge of a second stem (0 = none), yRange = height of the top
   * alignment edge (cap height, x-height, top of '-' ...).
   */
  zones: ([number, number, number, number] | null)[];
}

/** CSMTextSettings (tag 74) of a DefineText / DefineEditText character. */
export interface CsmSettings {
  /** UseFlashType = 1: "anti-alias for readability" (FlashType / Saffron advanced anti-aliasing). */
  flashType: boolean;
  /** GridFit: 0 none, 1 pixel, 2 subpixel. */
  gridFit: number;
  /** Thickness (-200..200) and Sharpness (-400..400); 0 = Flash's defaults. */
  thickness: number;
  sharpness: number;
}

export interface TextGlyphEntry { i: number /* glyph index */; adv: number /* px */ }

export interface TextRecord {
  fontId: number;
  color: RGBA;
  /** Absolute x/y of the record start in text space (px); y is the baseline. Carried over from previous records. */
  x: number;
  y: number;
  /** Text height (font size) in px. */
  height: number;
  glyphs: TextGlyphEntry[];
}

export interface StaticTextDef {
  t: 'text';
  id: number;
  ver: number;
  bounds: Rect;
  m: Mat;
  records: TextRecord[];
  /** CSMTextSettings for this text (absent: none in the SWF = normal anti-aliasing). */
  csm?: CsmSettings;
}

export interface EditTextDef {
  t: 'edit';
  id: number;
  bounds: Rect;
  fontId?: number;
  fontClass?: string;
  /** Font size in px. */
  height?: number;
  color?: RGBA;
  maxLength?: number;
  /** 0 left, 1 right, 2 center, 3 justify */
  align?: number;
  leftMargin?: number;
  rightMargin?: number;
  indent?: number;
  leading?: number;
  varName: string;
  initialText?: string;
  wordWrap: boolean;
  multiline: boolean;
  password: boolean;
  readOnly: boolean;
  noSelect: boolean;
  border: boolean;
  html: boolean;
  useOutlines: boolean;
  autoSize: boolean;
  wasStatic: boolean;
  /** CSMTextSettings for this field (absent: none in the SWF = normal anti-aliasing). */
  csm?: CsmSettings;
}

// ---------------------------------------------------------------- buttons

export interface ButtonRecord {
  up: boolean;
  over: boolean;
  down: boolean;
  hit: boolean;
  id: number;
  depth: number;
  m: Mat;
  cx?: CX;
  filters?: Filter[];
  blend?: number;
}

export interface ButtonDef {
  t: 'button';
  id: number;
  ver: number;
  trackAsMenu: boolean;
  records: ButtonRecord[];
  /** Indices into LibraryJson.actions for the button condition actions. */
  actions?: number[];
}

// ---------------------------------------------------------------- library

export type CharDef = ShapeDef | MorphDef | SpriteDef | BitmapDef | SoundDef | FontDef | StaticTextDef | EditTextDef | ButtonDef;

/** Location of an AVM1 action block in the SWF (for disassembly/completeness checks; bytecode not shipped). */
export interface ActionRef {
  kind: 'frame' | 'init' | 'button' | 'clip';
  /** 0 = root timeline */
  spriteId: number;
  /** 1-based frame for kind 'frame'; undefined otherwise */
  frame?: number;
  /** Byte offset of the action bytes in the decompressed SWF, and length. */
  offset: number;
  length: number;
  /** kind 'button': BUTTONCONDACTION condition flags (UI16 as stored, e.g. 0x0008 = OverDownToOverUp/release). */
  cond?: number;
}

export interface LibraryJson {
  v: 1;
  swfSha256: string;
  stage: { w: number; h: number; bg: RGBA; frameRate: number; frameCount: number; swfVersion: number };
  /** Export linkage name -> character id (ExportAssets). */
  exports: Record<string, number>;
  /** Linkage name -> AS2 class path from Object.registerClass (e.g. "Piece.WallPost" -> "World.Init.CWorld_Init_Piece"). */
  classes: Record<string, string>;
  chars: Record<string, CharDef>;
  root: SpriteDef;
  actions: ActionRef[];
}

// ---------------------------------------------------------------- XSI data (xsi.json)

/**
 * AVM1 value as evaluated from the XSI DoAction. Objects keep their property CREATION order as an ordered entry
 * list (`$`), because AS2 for..in enumeration order (which the original code relies on for paint order) depends on it.
 * Arrays are plain JSON arrays (null = hole/undefined).
 */
export type AsValue = null | boolean | number | string | AsValue[] | AsObject;
export interface AsObject { $: [string, AsValue][] }

export interface XsiJson {
  v: 1;
  /** `_global.mXSI_Data.mItems` in array order. */
  items: AsValue[];
  stats: { items: number; directionFrames: number; polygons: number; vertices: number };
}
