export type ResponseStage = 'input' | 'sample' | 'apply' | 'display' | 'sound' | 'wait' | 'replay';
export interface ResponseEntry { at: number; stage: ResponseStage; tick: number; role: number; detail: unknown }

/** Opt-in wall-clock diagnostics, owned by the session, outside world snapshots and wire state. */
export class ResponseTrace {
  enabled = false;
  private entries: ResponseEntry[] = [];
  setEnabled(enabled: boolean): void { this.enabled = enabled; this.entries = []; }
  record(stage: ResponseStage, tick: number, role: number, detail: unknown): void {
    if (!this.enabled) return;
    this.entries.push({ at: performance.now(), stage, tick, role, detail });
    if (this.entries.length > 2048) this.entries.splice(0, this.entries.length - 2048);
  }
  read(): readonly ResponseEntry[] { return this.entries.slice(); }
}
