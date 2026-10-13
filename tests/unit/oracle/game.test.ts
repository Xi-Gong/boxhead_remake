// P8: hooks injected into a copy of the real game SWF (Flash Player 28) vs the ported game classes (src/game) and
// the extractor's room reports. (tests/unit/oracle/golden.ts exports `initList(room)` for other lanes' tests.)
import { freshSaveData, fakeWorld } from '../game/f3/f3Setup.ts';
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CMain, Thing, World } from '../../../src/game/packages.ts';
import { numberToString } from '../../../src/engine/flash/as2.ts';
import { ROOM_PART, golden, initList } from './golden.ts';

const W = (): any => World;

describe('P8a: World.CUpgrades tables (port vs Flash)', () => {
  const g = () => golden('p8a_tables').results;
  function upgrades(): any {
    const sd = freshSaveData();
    sd.mDevilsActive = 1;
    (CMain as any).mFPS = 25;
    W().CWorld.mGameMode = 'Single';
    const world = fakeWorld();
    delete world.mThing_Collection;
    const hud = world.mHud; delete world.mHud;
    const up = new (W().CUpgrades)(world);
    world.mHud = hud;
    return up;
  }
  it('Flash ran InitLists with mFPS 25 and devils on', () => { expect(g().mFPS).toBe('25'); expect(g().mDevilsActive).toBe('1'); });
  it('level 1..100 entries (class.prop order and values) equal the port', () => {
    const up = upgrades();
    for (let L = 1; L <= 100; L++) {
      const lv: any[] = up.mLevels[L];
      expect(lv.map((e) => `${e.mClassID}.${e.mProp}`).join(';'), `keys L${L}`).toBe(g().levelKeys);
      expect(lv.map((e) => numberToString(e.mValue)).join(';'), `values L${L}`).toBe(g()[`level${L}`]);
    }
    expect(up.mLevels[0]).toBeUndefined();
    expect(up.mLevels[101]).toBeUndefined();
  });
  it('multiplier upgrade list (58 entries) equals the port', () => {
    const up = upgrades();
    const r = g();
    let n = 0;
    for (const k of Object.keys(r).filter((k) => /^mult\d+\.\d+$/.test(k))) {
      const [, idx, j] = /^mult(\d+)\.(\d+)$/.exec(k)!;
      const e = up.mMultipliers[Number(idx)][Number(j)];
      expect(`${e.mClassID}.${e.mProp}=${String(e.mValue)}|${e.mName}`, k).toBe(r[k]);
      n++;
    }
    expect(n).toBe(Number(r.multCount));
  });
});

describe('P8a: Thing.Math.CThing_Angle.mLookup256 (port vs Flash)', () => {
  it('rows 1..32 (256 entries each) equal the port; rows 0 and 33 do not exist', () => {
    const r = golden('p8a_tables').results;
    const A: any = Thing.Math.CThing_Angle;
    const keep = A.mLookup256;
    A.mLookup256 = undefined;
    A.Create_LookupTables();
    const D = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
    expect(r['lookup.length']).toBe('33|row0=undefined|row33=undefined');
    for (let n = 1; n <= 32; n++) {
      const row: number[] = A.mLookup256[n];
      expect(`${row.length}:${row.map((v) => D[v]).join('')}`, `n=${n}`).toBe(r[`lookup${n}`]);
    }
    A.mLookup256 = keep;
  });
});

const REPORTS = fileURLToPath(new URL('../../../generated/reports/rooms/', import.meta.url));
const TYPE_CODE: Record<string, string> = { Zombie: 'Z', Devil: 'D', Player1: '1', Player2: '2', Barrel: 'B', Wall: 'W', Pickup: 'K', CollisionSolid: 'C', Piece: 'S' };

describe('P8b/c/e: CWorld mInitList per room', () => {
  it('room entry counts as Flash reports them', () => {
    const counts = [54, 93, 192, 95, 62, 105, 161, 172, 128, 113, 97, 182, 443, 380, 124, 534, 241, 383];
    for (let r = 1; r <= 18; r++) {
      expect(initList(r).length, `room ${r}`).toBe(counts[r - 1]);
      expect(golden(ROOM_PART[r]!).results[`room${r}.n`]).toBe(String(counts[r - 1]));
    }
  });
  it('order is a pre-order walk by ascending depth: a Piece is followed by its nested CollisionSolid', () => {
    for (let r = 1; r <= 18; r++) {
      const l = initList(r);
      for (let i = 1; i < l.length; i++) {
        const a = l[i - 1]!.depthPath, b = l[i]!.depthPath;
        // b must come after a in pre-order: compare depth paths lexicographically (prefix = ancestor first)
        let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
        const ok = k === a.length ? b.length > a.length : (k < b.length && a[k]! < b[k]!);
        expect(ok, `room ${r} entries ${i - 1},${i}: ${a.join('/')} then ${b.join('/')}`).toBe(true);
      }
    }
  });
  it('the real game flow (CMain -> State_LoadWorld, room 18) registers the same list as a direct attachMovie("World")', () => {
    const d = golden('p8d_nav18').results;
    const real: string[] = [];
    for (let i = 0; d[`room18real.l${i}`] !== undefined; i++) real.push(...d[`room18real.l${i}`]!.split(';'));
    const direct: string[] = [];
    const e = golden('p8e_init_15_18').results;
    for (let i = 0; e[`room18.l${i}`] !== undefined; i++) direct.push(...e[`room18.l${i}`]!.split(';'));
    expect(real).toEqual(direct);
    expect(d['room18real.area']).toBe('2784x2784');
  });
  it('constructors of the room markers run on the frame AFTER attachMovie("World") from an event handler, all at once', () => {
    for (let r = 1; r <= 18; r++) {
      const res = golden(ROOM_PART[r]!).results;
      expect(res[`room${r}.afterAttach`], `room ${r}`).toBe('undefined|calls=0|roomData=true');
      expect(res[`room${r}.ctorCallsUniform`], `room ${r}`).toMatch(/^true\|t\d+\+0\|n=\d+$/);
    }
  });
  it.skipIf(!existsSync(`${REPORTS}room18.json`))('per-type counts agree with the extractor room reports (lane A)', () => {
    for (let r = 1; r <= 18; r++) {
      const rep = JSON.parse(readFileSync(`${REPORTS}room${String(r).padStart(2, '0')}.json`, 'utf8'));
      const want: Record<string, number> = {};
      for (const [t, n] of Object.entries(rep.counts as Record<string, number>)) if (n) want[TYPE_CODE[t]!] = n;
      const got: Record<string, number> = {};
      for (const e of initList(r)) got[e.code] = (got[e.code] ?? 0) + 1;
      expect(got, `room ${r}`).toEqual(want);
    }
  });
});

describe('P8d: nav BFS on BIG ONE (machine-dependent timing, FP28 on the dev PC)', () => {
  const calls = () => {
    const r = golden('p8d_nav18').results;
    return Object.keys(r).filter((k) => /^nav\d+$/.test(k)).map((k) => {
      const [states, d, n, p, ms] = r[k]!.split('|');
      const [from, to] = states!.split('>');
      return { from: from!, to: to!, d: Number(d!.slice(2)), n: Number(n!.slice(2)), p: Number(p!.slice(2)), ms: Number(ms!.slice(3)) };
    });
  };
  it('a restart call always processes exactly nInterations (5) layers without a time check', () => {
    const c = calls();
    const restarts = c.filter((x) => x.from === 'restart');
    expect(restarts.length).toBeGreaterThan(3);
    for (const x of restarts) expect(x.d).toBe(5);
    expect(golden('p8d_nav18').results['nav.start']).toMatch(/\|nInterations=5\|nTimeOut=3$/);
  });
  it('the flow field is rebuilt continuously: finished -> restart on the next tick', () => {
    const c = calls();
    for (let i = 1; i < c.length; i++) if (c[i - 1]!.to === 'finished') expect(c[i]!.from).toBe('restart');
    expect(c.some((x) => x.to === 'finished')).toBe(true);
  });
});
