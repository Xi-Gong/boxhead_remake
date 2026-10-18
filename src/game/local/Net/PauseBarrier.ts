import type { LanMessage, LanRole } from './protocol.ts';
type BarrierMessage = Extract<LanMessage, { t: 'pause-request' | 'pause-barrier' }>;

/** Host coordinates a common boundary without rolling back already-confirmed side effects. */
export class PauseBarrier {
  private id = 0;
  private frozen = false;
  private target: number | undefined;
  private readonly role: LanRole;
  private readonly send: (message: BarrierMessage) => void;
  constructor(role: LanRole, send: (message: BarrierMessage) => void) { this.role = role; this.send = send; }
  get pending(): boolean { return this.frozen; }
  request(paused: boolean, head: number): void {
    if (this.role === 1) { this.send({ t: 'pause-request', paused }); return; }
    if (!paused) {
      this.frozen = false; this.target = undefined;
      this.send({ t: 'pause-barrier', stage: 'resume', id: this.id, tick: head });
    } else if (!this.frozen) {
      this.frozen = true; this.target = undefined; ++this.id;
      this.send({ t: 'pause-barrier', stage: 'freeze', id: this.id, tick: head });
    }
  }
  receive(message: BarrierMessage, head: number): void {
    if (message.t === 'pause-request') { if (this.role === 0) this.request(message.paused, head); return; }
    if (!Number.isSafeInteger(message.tick) || message.tick < 0 || !Number.isSafeInteger(message.id) || message.id < 0) return;
    if (this.role === 1 && message.stage === 'freeze' && message.id > this.id) {
      this.id = message.id; this.frozen = true; this.target = undefined;
      this.send({ t: 'pause-barrier', stage: 'ready', id: this.id, tick: head });
    } else if (this.role === 0 && message.stage === 'ready' && message.id === this.id && this.frozen && this.target === undefined) {
      this.target = Math.max(head, message.tick);
      this.send({ t: 'pause-barrier', stage: 'commit', id: this.id, tick: this.target });
    } else if (this.role === 1 && message.id === this.id) {
      if (message.stage === 'commit' && this.frozen) this.target = message.tick;
      if (message.stage === 'resume') { this.frozen = false; this.target = undefined; }
    }
  }
  blocks(head: number): boolean { return this.frozen && (this.target === undefined || head >= this.target); }
  settled(head: number, confirmed: number, correcting: boolean): boolean {
    return this.frozen && this.target !== undefined && head === this.target && confirmed >= this.target - 1 && !correcting;
  }
}
