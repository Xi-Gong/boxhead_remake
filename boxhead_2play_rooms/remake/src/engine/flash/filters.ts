/**
 * flash.filters (AS2 API). These are plain parameter holders with the Flash 8 constructor signatures and defaults.
 * Angles are DEGREES in this API (SWF records store radians; use fromRecord()).
 * The pixel maths lives in ./filters/ (lane C) and is applied by the renderer / BitmapData.applyFilter.
 */
import type { Filter, RGBA } from '../../shared/assetSchema.ts';

export abstract class BitmapFilter {
  abstract readonly kind: Filter['t'];
  abstract clone(): BitmapFilter;
}

export class BlurFilter extends BitmapFilter {
  readonly kind = 'blur' as const;
  blurX: number; blurY: number; quality: number;
  constructor(blurX = 4, blurY = 4, quality = 1) {
    super();
    this.blurX = blurX; this.blurY = blurY; this.quality = quality;
  }
  clone(): BlurFilter { return new BlurFilter(this.blurX, this.blurY, this.quality); }
}

export class GlowFilter extends BitmapFilter {
  readonly kind = 'glow' as const;
  color: number; alpha: number; blurX: number; blurY: number; strength: number; quality: number; inner: boolean; knockout: boolean;
  constructor(color = 0xff0000, alpha = 1, blurX = 6, blurY = 6, strength = 2, quality = 1, inner = false, knockout = false) {
    super();
    this.color = color; this.alpha = alpha; this.blurX = blurX; this.blurY = blurY; this.strength = strength;
    this.quality = quality; this.inner = inner; this.knockout = knockout;
  }
  clone(): GlowFilter {
    return new GlowFilter(this.color, this.alpha, this.blurX, this.blurY, this.strength, this.quality, this.inner, this.knockout);
  }
}

export class DropShadowFilter extends BitmapFilter {
  readonly kind = 'dropShadow' as const;
  distance: number; angle: number; color: number; alpha: number; blurX: number; blurY: number; strength: number;
  quality: number; inner: boolean; knockout: boolean; hideObject: boolean;
  constructor(distance = 4, angle = 45, color = 0, alpha = 1, blurX = 4, blurY = 4, strength = 1, quality = 1,
    inner = false, knockout = false, hideObject = false) {
    super();
    this.distance = distance; this.angle = angle; this.color = color; this.alpha = alpha; this.blurX = blurX;
    this.blurY = blurY; this.strength = strength; this.quality = quality; this.inner = inner; this.knockout = knockout;
    this.hideObject = hideObject;
  }
  clone(): DropShadowFilter {
    return new DropShadowFilter(this.distance, this.angle, this.color, this.alpha, this.blurX, this.blurY, this.strength,
      this.quality, this.inner, this.knockout, this.hideObject);
  }
}

export class BevelFilter extends BitmapFilter {
  readonly kind = 'bevel' as const;
  distance: number; angle: number; highlightColor: number; highlightAlpha: number; shadowColor: number; shadowAlpha: number;
  blurX: number; blurY: number; strength: number; quality: number; type: 'inner' | 'outer' | 'full'; knockout: boolean;
  constructor(distance = 4, angle = 45, highlightColor = 0xffffff, highlightAlpha = 1, shadowColor = 0, shadowAlpha = 1,
    blurX = 4, blurY = 4, strength = 1, quality = 1, type: 'inner' | 'outer' | 'full' = 'inner', knockout = false) {
    super();
    this.distance = distance; this.angle = angle; this.highlightColor = highlightColor; this.highlightAlpha = highlightAlpha;
    this.shadowColor = shadowColor; this.shadowAlpha = shadowAlpha; this.blurX = blurX; this.blurY = blurY;
    this.strength = strength; this.quality = quality; this.type = type; this.knockout = knockout;
  }
  clone(): BevelFilter {
    return new BevelFilter(this.distance, this.angle, this.highlightColor, this.highlightAlpha, this.shadowColor,
      this.shadowAlpha, this.blurX, this.blurY, this.strength, this.quality, this.type, this.knockout);
  }
}

export class GradientGlowFilter extends BitmapFilter {
  readonly kind = 'gradientGlow' as const;
  distance: number; angle: number; colors: number[]; alphas: number[]; ratios: number[]; blurX: number; blurY: number;
  strength: number; quality: number; type: 'inner' | 'outer' | 'full'; knockout: boolean;
  constructor(distance = 4, angle = 45, colors: number[] = [], alphas: number[] = [], ratios: number[] = [], blurX = 4,
    blurY = 4, strength = 1, quality = 1, type: 'inner' | 'outer' | 'full' = 'inner', knockout = false) {
    super();
    this.distance = distance; this.angle = angle; this.colors = colors; this.alphas = alphas; this.ratios = ratios;
    this.blurX = blurX; this.blurY = blurY; this.strength = strength; this.quality = quality; this.type = type;
    this.knockout = knockout;
  }
  clone(): GradientGlowFilter {
    return new GradientGlowFilter(this.distance, this.angle, [...this.colors], [...this.alphas], [...this.ratios],
      this.blurX, this.blurY, this.strength, this.quality, this.type, this.knockout);
  }
}

export class ColorMatrixFilter extends BitmapFilter {
  readonly kind = 'colorMatrix' as const;
  matrix: number[];
  constructor(matrix: number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]) {
    super();
    this.matrix = [...matrix];
  }
  clone(): ColorMatrixFilter { return new ColorMatrixFilter(this.matrix); }
}

const rgb = (c: RGBA): number => (c[0] << 16) | (c[1] << 8) | c[2];
const deg = (rad: number): number => (rad * 180) / Math.PI;
const bevelType = (inner: boolean, onTop: boolean): 'inner' | 'outer' | 'full' => (onTop ? 'full' : inner ? 'inner' : 'outer');

/** Convert an extracted SWF filter record into the AS2 filter object (as Flash does for `mc.filters` getters). */
export function fromRecord(f: Filter): BitmapFilter | null {
  switch (f.t) {
    case 'blur': return new BlurFilter(f.blurX, f.blurY, f.passes);
    case 'glow': return new GlowFilter(rgb(f.color), f.color[3] / 255, f.blurX, f.blurY, f.strength, f.passes, f.inner, f.knockout);
    case 'dropShadow':
      return new DropShadowFilter(f.distance, deg(f.angle), rgb(f.color), f.color[3] / 255, f.blurX, f.blurY, f.strength,
        f.passes, f.inner, f.knockout, f.hideObject);
    case 'bevel':
      return new BevelFilter(f.distance, deg(f.angle), rgb(f.highlight), f.highlight[3] / 255, rgb(f.shadow), f.shadow[3] / 255,
        f.blurX, f.blurY, f.strength, f.passes, bevelType(f.inner, f.onTop), f.knockout);
    case 'gradientGlow':
      return new GradientGlowFilter(f.distance, deg(f.angle), f.colors.map(rgb), f.colors.map((c) => c[3] / 255), f.ratios,
        f.blurX, f.blurY, f.strength, f.passes, bevelType(f.inner, f.onTop), f.knockout);
    case 'colorMatrix': return new ColorMatrixFilter(f.m);
    default: return null; // gradientBevel / convolution are not used by this SWF
  }
}
