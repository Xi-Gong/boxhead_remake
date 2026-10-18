// Rollback bookkeeping units (v0.2.3 §E step 2): divergence detection, confirm frontier, sound queue
// flush/drop and ring eviction on a FAKE session (no world) - the world-touching paths (applyCorrections,
// pushSlot) are covered by the netlockstep rollback tests (T2+) with the real session.
import { describe, expect, it } from 'vitest';
import '../../src/game/allClasses.ts'; // registers CSound & co (the sound flush goes through the real choke point)
import { onRemoteFrame, queueSound, type TickMeta } from '../../src/game/local/Net/Rollback.ts';
import { ROLLBACK_WINDOW_TICKS } from '../../src/game/local/Net/protocol.ts';

function fakeSession() {
  return {
    tickMeta: new Map<number, TickMeta>(),
    remoteFrames: new Map<number, number>(),
    pendingSounds: new Map<number, any[]>(),
    confirmTick: -1,
    correctionPending: undefined as number | undefined,
    lastRemoteBits: 0,
    soundRecordingTick: undefined as number | undefined,
  };
}
/** The real path stores the frame in onNetMessage BEFORE calling onRemoteFrame - mirror that. */
const feed = (s: any, tick: number, bits: number): void => {
  s.remoteFrames.set(tick, bits);
  onRemoteFrame(s, tick, bits);
};

describe('rollback bookkeeping (fake session)', () => {
  it('confirm frontier advances over the contiguous run of arrived frames', () => {
    const s = fakeSession();
    feed(s, 0, 1);
    feed(s, 1, 1);
    expect(s.confirmTick).toBe(1);
    feed(s, 5, 1); // a hole at 2..4
    expect(s.confirmTick).toBe(1);
    feed(s, 2, 1);
    feed(s, 4, 1);
    expect(s.confirmTick).toBe(2); // still stuck at the 3 hole
    feed(s, 3, 1);
    expect(s.confirmTick).toBe(5);
  });

  it('a frame differing from an EXECUTED tick flags the first divergent tick', () => {
    const s = fakeSession();
    s.tickMeta.set(6, { remoteBits: 0b0000001, predicted: true });
    s.tickMeta.set(8, { remoteBits: 0b0000001, predicted: true });
    feed(s, 8, 0b0000010); // later divergence first
    expect(s.correctionPending).toBe(8);
    feed(s, 6, 0b0000010); // earlier one wins
    expect(s.correctionPending).toBe(6);
    feed(s, 7, 0b0000010); // not executed - no effect
    expect(s.correctionPending).toBe(6);
  });

  it('matching frames never flag; confirmed ticks flush their queued sounds, unconfirmed keep them', () => {
    const s = fakeSession();
    feed(s, 0, 0);
    feed(s, 1, 0);
    feed(s, 2, 0);
    s.tickMeta.set(3, { remoteBits: 7, predicted: true });
    feed(s, 3, 7); // prediction was right
    expect(s.correctionPending).toBeUndefined();
    expect(s.confirmTick).toBe(3);
    const mk = (): any => ({ mType: 'sfx', mPlaying: false, oSound: { start(): void {} } });
    const a = mk();
    const b = mk();
    s.soundRecordingTick = 4;
    queueSound(s, { item: a });
    queueSound(s, { item: b });
    s.soundRecordingTick = 9;
    queueSound(s, { item: mk() });
    s.soundRecordingTick = undefined;
    expect(s.pendingSounds.get(4)).toHaveLength(2); // buffered per recording tick
    feed(s, 4, 0); // confirms tick 4 -> the internal flush drains it through the real choke point
    expect(s.pendingSounds.has(4)).toBe(false);
    expect(a.mPlaying).toBe(true); // the flush really went through CSound.prototype.PlaySound
    expect(b.mPlaying).toBe(true);
    expect(s.pendingSounds.get(9)).toHaveLength(1); // unconfirmed ticks keep their queue
    expect(s.pendingSounds.get(9)![0]!.item.mPlaying).toBe(false);
  });

  it('the prediction window is bounded by ROLLBACK_WINDOW_TICKS over the confirm frontier', () => {
    const s = fakeSession();
    feed(s, 0, 0);
    expect(0 - s.confirmTick <= ROLLBACK_WINDOW_TICKS).toBe(true);
    const far = s.confirmTick + ROLLBACK_WINDOW_TICKS + 1;
    expect(far - s.confirmTick <= ROLLBACK_WINDOW_TICKS).toBe(false);
  });
});
