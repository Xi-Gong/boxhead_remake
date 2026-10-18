import { expect, it } from 'vitest';
import { EventJournal } from '../../../src/game/local/Net/Events.ts';

it('keeps legacy burst event identities, including colon-prefix kinds, after correction and discard',()=>{
  const journal=new EventJournal(),heard:number[]=[],reference:string[]=[];
  journal.begin(0);journal.record(0,0,'discarded',()=>{throw new Error('discarded event played');});
  journal.discardFrom(0);journal.begin(0);
  for(let n=0;n<2000;n++){
    const owner=n%3-1,kind=['explosion','explosion:0','explosion:0:1','scorch:'+n+':12:0:1'][n%4]!;
    const prefix=`0:${owner}:${kind}:`,ordinal=reference.filter(id=>id.startsWith(prefix)).length;
    reference.push(prefix+ordinal);journal.record(0,owner,kind,()=>heard.push(n));
  }
  let hash=0x811c9dc5;
  for(const id of reference)for(let n=0;n<id.length;n++)hash=Math.imul(hash^id.charCodeAt(n),0x01000193)>>>0;
  journal.confirm(0);
  expect(journal.confirmedHash).toBe(hash);expect(journal.confirmedCount).toBe(2000);
  expect(heard).toEqual(Array.from({length:2000},(_,n)=>n));expect(journal.retainedEvents).toBe(0);
});

it('plays local feedback immediately, defers remote feedback and deduplicates correction/confirmation', () => {
  const e = new EventJournal();
  const heard: string[] = [];
  e.begin(0);
  e.record(0, 0, 'gun', () => heard.push('local'));
  e.record(0, 1, 'gun', () => heard.push('wrong remote'));
  e.presentLocal(0);
  expect(heard).toEqual(['local']);
  e.begin(0); // correction replaces the predicted branch
  e.record(0, 0, 'gun', () => heard.push('duplicate local'));
  e.record(0, 1, 'rocket', () => heard.push('remote'));
  e.presentLocal(0);
  e.confirm(0);
  expect(heard).toEqual(['local', 'remote']);
  expect(e.confirmedCount).toBe(2);
  expect(e.retainedEvents).toBe(0);
  expect(() => e.begin(0)).toThrow('confirmed');
});

it('confirmation identity is independent of speculative playback and bounded over long runs', () => {
  const a = new EventJournal();
  const b = new EventJournal();
  for (let tick = 0; tick < 1000; tick++) {
    a.begin(tick); b.begin(tick);
    a.record(tick, 0, 'wrong', () => {});
    a.presentLocal(0);
    a.begin(tick);
    for (const journal of [a, b]) {
      journal.record(tick, 1, 'gun', () => {});
      journal.record(tick, 1, 'gun', () => {});
      journal.confirm(tick);
    }
  }
  expect(a.confirmedHash).toBe(b.confirmedHash);
  expect(a.confirmedCount).toBe(2000);
  expect(a.retainedEvents).toBe(0);
});
