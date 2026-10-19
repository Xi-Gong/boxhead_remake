import { describe, expect, it } from 'vitest';
import { validateWaveText, validWaveNumber } from '../../../src/game/local/WaveValidation.ts';

describe('complete wave text validation',()=>{
  it.each(['1','100','00100','  00100\t','0'.repeat(2000)+'100'])('normalizes a legal whole draft %s',raw=>{
    const result=validateWaveText(raw,100);expect(result).toEqual({ok:true,value:Number(raw.trim())});
  });
  it.each(['',' ','0','101','12x','一','１２','1.0','1.5','+1','-1','1e1','0x10','1 0','1\n0','9'.repeat(1000)])('rejects the whole invalid draft %s',raw=>{
    expect(validateWaveText(raw,100).ok).toBe(false);
  });
  it('uses the unlocked limit and preserves an explicit classic limit of 100',()=>{
    expect(validateWaveText('12',12)).toEqual({ok:true,value:12});
    expect(validateWaveText('13',12).ok).toBe(false);expect(validateWaveText('101',100).ok).toBe(false);
    for(const value of ['1',NaN,Infinity,1.2,0,101,null,undefined])expect(validWaveNumber(value,100)).toBe(false);
    expect(validWaveNumber(1,1)).toBe(true);
  });
  it('accepts unlocked modern waves beyond 100 without exceeding the supplied limit',()=>{
    expect(validateWaveText('101',1000)).toEqual({ok:true,value:101});expect(validateWaveText('1000',1000)).toEqual({ok:true,value:1000});
    expect(validateWaveText('1001',1000).ok).toBe(false);expect(validWaveNumber(101,1000)).toBe(true);
  });
});
