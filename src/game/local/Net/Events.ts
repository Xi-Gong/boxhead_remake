// Presentation events are rebuildable; already-heard speculative sounds cannot be undone.
// Identity is per tick/emitter/kind occurrence, independent of network arrival and replay count.
interface Event { id: string; owner: number; play: () => void }
interface TickEvents { events: Event[]; ordinals: Map<string, number> }
export class EventJournal {
  private readonly pending = new Map<number, TickEvents>();
  private readonly played = new Map<string, number>();
  confirmedTick = -1;
  confirmedCount = 0;
  confirmedHash = 0x811c9dc5;

  begin(tick: number): void {
    if (tick <= this.confirmedTick) throw new Error('Cannot rewrite confirmed events');
    this.pending.set(tick, { events: [], ordinals: new Map() });
  }
  discardFrom(tick: number): void {
    for (const at of this.pending.keys()) if (at >= tick) this.pending.delete(at);
  }

  record(tick: number, owner: number, kind: string, play: () => void): void {
    const batch = this.pending.get(tick);
    if (!batch) throw new Error('Event outside simulation step');
    const stem = `${tick}:${owner}:`, prefix = stem + kind + ':';
    const ordinal = batch.ordinals.get(prefix) ?? 0;
    batch.events.push({ id: prefix + ordinal, owner, play });
    // Count colon-terminated ancestors as well: legacy startsWith semantics count kind "boom:0"
    // towards a later "boom" event. Work is bounded by identity length, never the burst size.
    for (let at = prefix.indexOf(':', stem.length); at >= 0; at = prefix.indexOf(':', at + 1)) {
      const ancestor = prefix.slice(0, at + 1);
      batch.ordinals.set(ancestor, (batch.ordinals.get(ancestor) ?? 0) + 1);
    }
  }

  presentLocal(role: number): void {
    for (const [tick, { events }] of this.pending) {
      for (const event of events) if (event.owner === role) this.play(tick, event);
    }
  }

  confirm(tick: number): void {
    if (tick !== this.confirmedTick + 1) throw new Error('Non-contiguous event confirmation');
    for (const event of this.pending.get(tick)?.events ?? []) {
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
  get retainedEvents(): number { return this.played.size + [...this.pending.values()].reduce((n, a) => n + a.events.length, 0); }
}
