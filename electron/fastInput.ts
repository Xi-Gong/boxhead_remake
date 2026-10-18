// Optional redundant UDP input path. TCP remains the reliable control/input fallback.
import { createSocket, type Socket } from 'node:dgram';
import { randomUUID } from 'node:crypto';
import type { LanMessage } from '../src/game/local/Net/protocol.ts';

type Input = Extract<LanMessage, { t: 'in' }>;
type Offer = Extract<LanMessage, { t: 'input-path' }>;
const LIMIT = 1200;
export class FastInputPath {
  private socket: Socket | undefined;
  private timer: NodeJS.Timeout | undefined;
  private readonly token = randomUUID();
  private remote: Offer | undefined;
  private epoch: string | undefined;
  private frames = new Map<number, number>();
  private received = new Map<number, number>();
  private port = 0;
  private closed = false;
  private readonly ip: string;
  private readonly offer: (message: Offer) => void;
  private readonly deliver: (message: Input) => void;
  private readonly delay: number;
  readonly stats = { sent: 0, received: 0, rejected: 0 };

  constructor(ip: string, offer: (message: Offer) => void, deliver: (message: Input) => void, delay = 0) {
    this.ip = ip.replace(/^::ffff:/, ''); this.offer = offer; this.deliver = deliver; this.delay = delay;
    const socket = createSocket('udp4'); this.socket = socket;
    socket.on('error', () => this.close()); // UDP unavailable is a supported TCP-only path.
    socket.on('message', (data, from) => {
      if (this.closed || from.address !== this.ip || from.port !== this.remote?.port || data.length > LIMIT) return;
      let body: any;
      try { body = JSON.parse(data.toString('utf8')); } catch { this.stats.rejected++; return; }
      if (!this.epoch || body?.token !== this.token || body.epoch !== this.epoch || !Array.isArray(body.frames) || body.frames.length > 8) {
        this.stats.rejected++; return;
      }
      for (const row of body.frames) {
        if (!Array.isArray(row) || row.length !== 2 || !Number.isSafeInteger(row[0]) || row[0] < 0 || !Number.isInteger(row[1]) || row[1] < 0 || row[1] > 127) {
          this.stats.rejected++; return;
        }
      }
      for (const [tick, bits] of body.frames) {
        if (this.received.has(tick)) continue;
        this.received.set(tick, bits);
        this.stats.received++;
        this.deliver({ t: 'in', tick, bits });
      }
      const newest = Math.max(-1, ...this.received.keys());
      for (const tick of this.received.keys()) if (tick < newest - 64) this.received.delete(tick);
    });
    socket.bind(0, '0.0.0.0', () => {
      if (this.closed) return;
      this.port = (socket.address() as { port: number }).port;
      this.offer({ t: 'input-path', version: 1, port: this.port, token: this.token });
      this.timer = setInterval(() => this.flush(), 40);
    });
  }

  accept(offer: Offer): void {
    if (offer.version !== 1 || !Number.isInteger(offer.port) || offer.port < 1 || offer.port > 65535 || typeof offer.token !== 'string' || offer.token.length > 64) return;
    this.remote = offer;
    this.flush();
  }
  begin(epoch: string | undefined): void {
    this.epoch = typeof epoch === 'string' && epoch.length <= 64 ? epoch : undefined;
    this.frames.clear(); this.received.clear();
  }
  send(input: Input): void {
    if (!this.epoch) return;
    this.frames.set(input.tick, input.bits);
    const newest = Math.max(...this.frames.keys());
    for (const tick of this.frames.keys()) if (tick < newest - 7) this.frames.delete(tick);
    this.flush();
  }
  private flush(): void {
    const socket = this.socket, remote = this.remote, epoch = this.epoch;
    if (this.closed || !socket || !this.port || !remote || !epoch || !this.frames.size) return;
    const data = Buffer.from(JSON.stringify({ token: remote.token, epoch, frames: [...this.frames] }));
    if (data.length > LIMIT) return;
    const send = () => {
      if (this.closed || this.epoch !== epoch || this.socket !== socket) return;
      socket.send(data, remote.port, this.ip, () => {}); this.stats.sent++;
    };
    if (this.delay) setTimeout(send, this.delay); else send();
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const socket = this.socket; this.socket = undefined;
    try { socket?.close(); } catch { /* binding failed or already closed */ }
    this.frames.clear(); this.received.clear();
  }
}
