// Presentation events are rebuildable; already-heard speculative sounds cannot be undone.
// Identity is per tick/emitter/kind occurrence, independent of network arrival and replay count.
interface Event { id: string; owner: number; play: () => void }
export class EventJournal {
  private readonly pending = new Map<number, Event[]>();
  private readonly played = new Map<string, number>();
  confirmedTick = -1;
  confirmedCount = 0;
  confirmedHash = 0x811c9dc5;

  begin(tick: number): void {
    if (tick <= this.confirmedTick) throw new Error('Cannot rewrite confirmed events');
    this.pending.set(tick, []);
  }

  record(tick: number, owner: number, kind: string, play: () => void): void {
    const events = this.pending.get(tick);
    if (!events) throw new Error('Event outside simulation step');
    const prefix = `${tick}:${owner}:${kind}:`;
    const ordinal = events.filter(e => e.id.startsWith(prefix)).length;
    events.push({ id: prefix + ordinal, owner, play });
  }

  presentLocal(role: number): void {
    for (const [tick, events] of this.pending) {
      for (const event of events) if (event.owner === role) this.play(tick, event);
    }
  }

  confirm(tick: number): void {
    if (tick !== this.confirmedTick + 1) throw new Error('Non-contiguous event confirmation');
    for (const event of this.pending.get(tick) ?? []) {
      for (let i = 0; i < event.id.length; i++) {
        this.confirmedHash = Math.imul(this.confirmedHash ^ event.id.charCodeAt(i), 0x01000193) >>> 0;
      }
      this.confirmedCount++;
      this.play(tick, event);
    }
    this.pending.delete(tick);
    this.confirmedTick = tick;
    for (const [id, at] of this.played) if (at <= tick) this.played.delete(id);
  }

  private play(tick: number, event: Event): void {
    if (this.played.has(event.id)) return;
    this.played.set(event.id, tick);
    event.play();
  }
  get retainedEvents(): number { return this.played.size + [...this.pending.values()].reduce((n, a) => n + a.length, 0); }
}
