/**
 * Little-endian byte reader with SWF bit-field support (UB/SB/FB), per the SWF File Format Specification v19.
 * Byte reads implicitly re-align to a byte boundary (as the spec requires after bit fields).
 */
export class ByteReader {
  readonly buf: Uint8Array;
  readonly view: DataView;
  pos: number;
  /** End (exclusive) of the readable window. */
  end: number;
  private bitBuf = 0;
  private bitCount = 0;

  constructor(buf: Uint8Array, pos = 0, end = buf.length) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.pos = pos;
    this.end = end;
  }

  /** Sub-reader over [pos, pos+len) sharing the buffer. Advances this reader past the window. */
  sub(len: number): ByteReader {
    this.align();
    if (this.pos + len > this.end) throw new RangeError(`sub(${len}) past end at ${this.pos}`);
    const r = new ByteReader(this.buf, this.pos, this.pos + len);
    this.pos += len;
    return r;
  }

  get remaining(): number { return this.end - this.pos; }
  get eof(): boolean { return this.pos >= this.end; }

  align(): void { this.bitCount = 0; this.bitBuf = 0; }

  private check(n: number): void {
    if (this.pos + n > this.end) throw new RangeError(`read ${n} bytes past end (pos ${this.pos}, end ${this.end})`);
  }

  u8(): number { this.align(); this.check(1); return this.buf[this.pos++]; }
  s8(): number { this.align(); this.check(1); return this.view.getInt8(this.pos++); }
  u16(): number { this.align(); this.check(2); const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  s16(): number { this.align(); this.check(2); const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  u32(): number { this.align(); this.check(4); const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  s32(): number { this.align(); this.check(4); const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  f32(): number { this.align(); this.check(4); const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  /** IEEE double stored little-endian (as in DefineFont / AMF). For AVM1 Push doubles use `avm1Double`. */
  f64(): number { this.align(); this.check(8); const v = this.view.getFloat64(this.pos, true); this.pos += 8; return v; }
  /** AVM1 Push type 6 double: two little-endian 32-bit halves, high word first. */
  avm1Double(): number {
    this.align(); this.check(8);
    const tmp = new Uint8Array(8);
    tmp.set(this.buf.subarray(this.pos + 4, this.pos + 8), 0);
    tmp.set(this.buf.subarray(this.pos, this.pos + 4), 4);
    this.pos += 8;
    return new DataView(tmp.buffer).getFloat64(0, true);
  }
  /** 16.16 fixed point */
  fixed(): number { return this.s32() / 65536; }
  /** 8.8 fixed point */
  fixed8(): number { return this.s16() / 256; }
  /** EncodedU32 (variable length) */
  encodedU32(): number {
    this.align();
    let result = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      result |= (b & 0x7f) << (7 * i);
      if (!(b & 0x80)) break;
    }
    return result >>> 0;
  }
  bytes(n: number): Uint8Array { this.align(); this.check(n); const v = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return v; }
  /** Null-terminated string. SWF6+ strings are UTF-8. */
  string(): string {
    this.align();
    const start = this.pos;
    while (this.pos < this.end && this.buf[this.pos] !== 0) this.pos++;
    const s = new TextDecoder('utf-8').decode(this.buf.subarray(start, this.pos));
    if (this.pos < this.end) this.pos++; // skip terminator
    return s;
  }

  /** Unsigned bit field of n bits. */
  ub(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (this.bitCount === 0) {
        this.check(1);
        this.bitBuf = this.buf[this.pos++];
        this.bitCount = 8;
      }
      this.bitCount--;
      v = v * 2 + ((this.bitBuf >> this.bitCount) & 1);
    }
    return v;
  }
  /** Signed bit field of n bits (two's complement). */
  sb(n: number): number {
    if (n === 0) return 0;
    const v = this.ub(n);
    const sign = 2 ** (n - 1);
    return v >= sign ? v - 2 ** n : v;
  }
  /** 16.16 fixed-point bit field. */
  fb(n: number): number { return this.sb(n) / 65536; }
  bit(): boolean { return this.ub(1) === 1; }
}
