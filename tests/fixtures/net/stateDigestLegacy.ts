import type { SV, WorldSnap } from '../../../src/game/local/Net/WorldSnap.ts';

/** Render caches are shared immutable assets, never authoritative state. Keep ordered own properties. */
export function simulationDigest(s: WorldSnap): Record<string, string> {
  const ignored = new Set(['mControls', 'mVisible']);
  const encode = (value: unknown, seen = new Map<object, number>()): unknown => {
    if (value === undefined) return ['undefined'];
    if (typeof value === 'number' && !Number.isFinite(value)) return [String(value)];
    if (value === null || typeof value !== 'object') return value;
    const previous = seen.get(value);
    if (previous !== undefined) return ['ref', previous];
    seen.set(value, seen.size);
    if (Array.isArray(value)) {
      // These are immutable data/prototype identities. Registry indices depend on render traversal.
      if (value[0] === 'shared') return ['asset'];
      // PreUpdate/current direction/frame are render caches. GetWeaponPosition refreshes them before use.
      if (value[0] === 'xsi') return ['xsi', value[9], value[2], value[3], value[5]];
      if (value[0] === 'mcanim') return ['mcanim', value[1], value[2]];
      if (value[0] === 'obj') return ['obj', value[1], encode(value[2], seen)];
      return value.map(v => encode(v, seen));
    }
    return Object.entries(value).map(([key, v]) => [key, encode(v, seen)]);
  };
  const hash = (value: unknown): string => {
    const text = JSON.stringify(encode(value));
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  };
  const things = Object.entries(s.things).map(([id, thing]) => [id, thing.cls,
    thing.props.filter(([key]) => !ignored.has(key)).map(([key, value]) =>
      [key, key === 'mFlags' && typeof value === 'number' ? value & ~8 : value] as [string, SV])]);
  return {
    things: hash(things), cells: hash(s.cells), collection: hash(s.collection),
    navigation: hash(s.nav), upgrades: hash(s.upgrades), slots: hash(s.slots),
    random: hash([s.rng, s.allocID]),
    // mScores contains floating score sprites, moved/removed by CHud.Draw, not gameplay score.
    outcome: hash([s.world.mCompleteState, s.hud.nTotalScore, s.hud.mPlayer1_Deaths, s.hud.mPlayer2_Deaths]),
  };
}
