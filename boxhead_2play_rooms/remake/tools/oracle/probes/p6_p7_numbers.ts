/**
 * P6: Number -> String conversion (trace / String() / concatenation / toString(radix)).
 * P7: Math.round/floor/ceil, int(), %, bitwise ops on large numbers, string -> number (Number, parseInt, parseFloat,
 *     implicit), comparisons and boolean conversions.
 * Each case is [label, AS expression]; results are what `"" + (expr)` gives in Flash (labels are the golden keys).
 */
import { compileAS, PRELUDE } from '../as1c.ts';
import { singleFrameSwf } from '../swfWrite.ts';
import type { ProbeDef } from './index.ts';

export const P6_CASES: [string, string][] = [
  ['0.1+0.2', '0.1 + 0.2'], ['1/3', '1 / 3'], ['2/3', '2 / 3'], ['1/7', '1 / 7'], ['100/3*3', '100 / 3 * 3'],
  ['0.1*3', '0.1 * 3'], ['1.005', '1.005'], ['4.35*100', '4.35 * 100'], ['255/256', '255 / 256'], ['123.456', '123.456'],
  ['-1.5', '-1.5'], ['3.0000000000000004', '3.0000000000000004'], ['0.30000000000000004', '0.30000000000000004'],
  ['1e21', '1e21'], ['1e20', '1e20'], ['1e16', '1e16'], ['1e15', '1e15'], ['1e14', '1e14'], ['123456789012345', '123456789012345'],
  ['1234567890123456', '1234567890123456'], ['123456789012345680000', '123456789012345680000'], ['1e14+0.5', '1e14 + 0.5'],
  ['99999999999999.99', '99999999999999.99'], ['999999999999999.9', '999999999999999.9'], ['9.999999999999999e22', '9.999999999999999e22'],
  ['2^31-1', '2147483647'], ['2^31', '2147483648'], ['-2^31', '-2147483648'], ['-2^31-1', '-2147483649'], ['2^32', '4294967296'],
  ['2^53', '9007199254740992'], ['2^53+2', '9007199254740994'], ['-0', '-0'], ['NaN', '0 / 0'], ['Infinity', '1 / 0'],
  ['-Infinity', '-1 / 0'], ['1e-7', '1e-7'], ['1.5e-7', '1.5e-7'], ['0.000001', '0.000001'], ['0.00001', '0.00001'],
  ['0.0001', '0.0001'], ['0.001234', '0.001234'], ['1.25e-5', '1.25e-5'], ['5e-324', '5e-324'],
  ['1.7976931348623157e308', '1.7976931348623157e308'], ['0.5', '0.5'], ['1e300*10', '1e300 * 10'], ['12345678.9', '12345678.9'],
  ['0.1+0.7', '0.1 + 0.7'], ['1.1*1.1', '1.1 * 1.1'], ['1/3*3', '1 / 3 * 3'], ['2.675', '2.675'], ['1e-5*3', '1e-5 * 3'],
  ['123456.7890123456', '123456.7890123456'], ['0.1234567890123456789', '0.1234567890123456789'],
  ['999999999999999', '999999999999999'], ['9999999999999999', '9999999999999999'], ['1e15+0.3', '1e15 + 0.3'],
  ['-1e-7', '-1e-7'], ['-123456789012345680000', '-123456789012345680000'], ['4.5e15', '4.5e15'], ['0.99999999999999999', '0.99999999999999999'],
  ['0.999999999999999', '0.999999999999999'], ['0.9999999999999999', '0.9999999999999999'],
  ['String(1/3)', 'String(1 / 3)'], ['(1/3).toString()', '(1 / 3).toString()'], ['(255).toString(16)', '(255).toString(16)'],
  ['(-255).toString(16)', '(-255).toString(16)'], ['(255.5).toString(16)', '(255.5).toString(16)'], ['(5).toString(2)', '(5).toString(2)'],
  ['(0.5).toString(2)', '(0.5).toString(2)'], ['(4294967295).toString(16)', '(4294967295).toString(16)'],
  ['(-1).toString(16)', '(-1).toString(16)'], ['(1e21).toString(16)', '(1e21).toString(16)'], ['(35).toString(36)', '(35).toString(36)'],
  ['1e25', '1e25'], ['1e50', '1e50'], ['1e100', '1e100'], ['1e200', '1e200'], ['1e300', '1e300'], ['1.5e30', '1.5e30'],
  ['2e100', '2e100'], ['123e45', '123e45'], ['1e-10', '1e-10'], ['1e-50', '1e-50'], ['1e-100', '1e-100'], ['1e-200', '1e-200'],
  ['1e-300', '1e-300'], ['3.3e-20', '3.3e-20'], ['1e22', '1e22'], ['1e23', '1e23'], ['5e-7', '5e-7'], ['1.2345678901234567e-8', '1.2345678901234567e-8'],
  ['0.1+0.2-0.3', '0.1 + 0.2 - 0.3'], ['1/(0*-1)', '1 / (0 * -1)'], ['1/-0', '1 / -0'], ['1/(-1e-300*1e-300)', '1 / (-1e-300 * 1e-300)'],
  ['(10).toString(1)', '(10).toString(1)'], ['(10).toString(37)', '(10).toString(37)'], ['new Number(1/3)', 'new Number(1 / 3)'],
];

export const P7_CASES: [string, string][] = [
  // Math.round / floor / ceil (1/x reveals -0)
  ['round(-2.5)', 'Math.round(-2.5)'], ['round(2.5)', 'Math.round(2.5)'], ['round(-0.5)', 'Math.round(-0.5)'], ['1/round(-0.5)', '1 / Math.round(-0.5)'],
  ['round(1.5)', 'Math.round(1.5)'], ['round(-1.5)', 'Math.round(-1.5)'], ['round(0.49999999999999994)', 'Math.round(0.49999999999999994)'],
  ['round(-0.49999999999999994)', 'Math.round(-0.49999999999999994)'], ['round(NaN)', 'Math.round(0/0)'], ['round(1e300)', 'Math.round(1e300)'],
  ['round(4503599627370497)', 'Math.round(4503599627370497)'], ['round(-1e-300)', '1 / Math.round(-1e-300)'], ['round(2.4999999)', 'Math.round(2.4999999)'],
  ['round("2.5")', 'Math.round("2.5")'], ['round(undefined)', 'Math.round(undefined)'],
  ['floor(-0.5)', 'Math.floor(-0.5)'], ['1/ceil(-0.5)', '1 / Math.ceil(-0.5)'], ['floor(NaN)', 'Math.floor(0/0)'], ['ceil(1e-300)', 'Math.ceil(1e-300)'],
  ['floor(-1e-300)', 'Math.floor(-1e-300)'], ['floor(2^53+0.5)', 'Math.floor(9007199254740993)'], ['floor("3.7")', 'Math.floor("3.7")'],
  // int()
  ['int(-1.7)', 'int(-1.7)'], ['int(1.7)', 'int(1.7)'], ['int("3.9")', 'int("3.9")'], ['int(NaN)', 'int(0/0)'], ['int(Infinity)', 'int(1/0)'],
  ['int(-Infinity)', 'int(-1/0)'], ['int(2147483647.9)', 'int(2147483647.9)'], ['int(2147483648)', 'int(2147483648)'], ['int(-2147483649)', 'int(-2147483649)'],
  ['int(1e10)', 'int(1e10)'], ['int(4294967295.5)', 'int(4294967295.5)'], ['int(4294967296)', 'int(4294967296)'], ['1/int(-0.5)', '1 / int(-0.5)'],
  ['int("0x10")', 'int("0x10")'], ['int(undefined)', 'int(undefined)'], ['int(null)', 'int(null)'], ['int(true)', 'int(true)'], ['int("abc")', 'int("abc")'],
  ['int(" 12")', 'int(" 12")'], ['int(1e21)', 'int(1e21)'], ['int(-3e9)', 'int(-3e9)'], ['int(3e9)', 'int(3e9)'], ['int(1e19)', 'int(1e19)'],
  // modulo
  ['-5%3', '-5 % 3'], ['5%-3', '5 % -3'], ['-5.5%2', '-5.5 % 2'], ['5%0', '5 % 0'], ['5.5%1', '5.5 % 1'], ['1/(-0%5)', '1 / (-0 % 5)'],
  ['1e20%3', '1e20 % 3'], ['1/(-7%7)', '1 / (-7 % 7)'], ['0.3%0.1', '0.3 % 0.1'], ['"7"%"3"', '"7" % "3"'], ['-1%256', '-1 % 256'],
  ['(-1+256)%256', '(-1 + 256) % 256'],
  // bitwise
  ['2^32|0', '4294967296 | 0'], ['2^31|0', '2147483648 | 0'], ['1e10|0', '1e10 | 0'], ['-1>>>0', '-1 >>> 0'], ['1<<32', '1 << 32'], ['1<<31', '1 << 31'],
  ['1<<33', '1 << 33'], ['3.7|0', '3.7 | 0'], ['-3.7|0', '-3.7 | 0'], ['NaN|0', '(0/0) | 0'], ['1e21|0', '1e21 | 0'], ['2.5e20|0', '2.5e20 | 0'],
  ['1e19|0', '1e19 | 0'], ['-1e19|0', '-1e19 | 0'], ['9007199254740993|0', '9007199254740993 | 0'], ['4294967295&255', '4294967295 & 255'],
  ['-1>>1', '-1 >> 1'], ['-1>>>1', '-1 >>> 1'], ['0xFFFFFFFF^0', '0xFFFFFFFF ^ 0'], ['"0x10"|0', '"0x10" | 0'], ['"12"|0', '"12" | 0'],
  ['undefined|0', 'undefined | 0'], ['1<<-1', '1 << -1'], ['5>>33', '5 >> 33'], ['2147483648*-1|0', '(2147483648 * -1) | 0'],
  ['16777215&-7.9', '16777215 & -7.9'], ['-7.9&16777215', '-7.9 & 16777215'], ['1e10&16777215', '1e10 & 16777215'],
  ['Infinity|0', '(1/0) | 0'], ['~2147483648', '~2147483648'], ['-2147483649|0', '-2147483649 | 0'], ['4294967296.5|0', '4294967296.5 | 0'],
  ['2^64|0', '18446744073709551616 | 0'], ['2^63|0', '9223372036854775808 | 0'], ['2^62+2^31|0', '(4611686018427387904 + 2147483648) | 0'],
  // Number(string)
  ['Number("")', 'Number("")'], ['Number(" ")', 'Number(" ")'], ['Number("0x10")', 'Number("0x10")'], ['Number(" 12")', 'Number(" 12")'],
  ['Number("12 ")', 'Number("12 ")'], ['Number("1e3")', 'Number("1e3")'], ['Number("010")', 'Number("010")'], ['Number("-010")', 'Number("-010")'],
  ['Number("08")', 'Number("08")'], ['Number("-0x10")', 'Number("-0x10")'], ['Number("+5")', 'Number("+5")'], ['Number(".5")', 'Number(".5")'],
  ['Number("5.")', 'Number("5.")'], ['Number("Infinity")', 'Number("Infinity")'], ['Number("-Infinity")', 'Number("-Infinity")'],
  ['Number(true)', 'Number(true)'], ['Number(null)', 'Number(null)'], ['Number(undefined)', 'Number(undefined)'], ['Number("abc")', 'Number("abc")'],
  ['Number("0xFFFFFFFF")', 'Number("0xFFFFFFFF")'], ['Number("0x100000000")', 'Number("0x100000000")'], ['Number("1e")', 'Number("1e")'],
  ['Number("\\t5")', 'Number("\\t5")'], ['Number("\\n5")', 'Number("\\n5")'], ['Number("1,5")', 'Number("1,5")'], ['Number("0")', 'Number("0")'],
  ['Number("-0")', '1 / Number("-0")'], ['Number("00")', 'Number("00")'], ['Number("0.5e1")', 'Number("0.5e1")'], ['Number("0x")', 'Number("0x")'],
  ['Number("1e400")', 'Number("1e400")'], ['Number("019")', 'Number("019")'], ['Number("07.5")', 'Number("07.5")'],
  // parseInt / parseFloat
  ['parseInt("12abc")', 'parseInt("12abc")'], ['parseInt("0x1F")', 'parseInt("0x1F")'], ['parseInt("010")', 'parseInt("010")'],
  ['parseInt("  42")', 'parseInt("  42")'], ['parseInt("")', 'parseInt("")'], ['parseInt("1e3")', 'parseInt("1e3")'], ['parseInt("-12.7")', 'parseInt("-12.7")'],
  ['parseInt("08")', 'parseInt("08")'], ['parseInt("09")', 'parseInt("09")'], ['parseInt("0x")', 'parseInt("0x")'], ['parseInt("ff",16)', 'parseInt("ff", 16)'],
  ['parseInt("10",2)', 'parseInt("10", 2)'], ['parseInt("-0x10")', 'parseInt("-0x10")'], ['parseInt("  -010")', 'parseInt("  -010")'],
  ['parseInt("123",0)', 'parseInt("123", 0)'], ['parseInt("123",1)', 'parseInt("123", 1)'], ['parseInt("z",36)', 'parseInt("z", 36)'],
  ['parseInt("12",37)', 'parseInt("12", 37)'], ['parseInt("\\n42")', 'parseInt("\\n42")'], ['parseInt(12.9)', 'parseInt(12.9)'],
  ['parseInt("4294967296")', 'parseInt("4294967296")'], ['parseInt("0x100000000")', 'parseInt("0x100000000")'], ['parseInt(undefined)', 'parseInt(undefined)'],
  ['parseFloat("3.14abc")', 'parseFloat("3.14abc")'], ['parseFloat(".5")', 'parseFloat(".5")'], ['parseFloat("1e3x")', 'parseFloat("1e3x")'],
  ['parseFloat("")', 'parseFloat("")'], ['parseFloat("  -1.5e-3")', 'parseFloat("  -1.5e-3")'], ['parseFloat("Infinity")', 'parseFloat("Infinity")'],
  ['parseFloat("0x10")', 'parseFloat("0x10")'], ['parseFloat("1e")', 'parseFloat("1e")'], ['parseFloat("-.5")', 'parseFloat("-.5")'],
  // implicit conversions
  ['"5"*1', '"5" * 1'], ['""*1', '"" * 1'], ['" "*1', '" " * 1'], ['"0x10"*1', '"0x10" * 1'], ['undefined+1', 'undefined + 1'],
  ['null*1', 'null * 1'], ['true+1', 'true + 1'], ['"3"+1', '"3" + 1'], ['"3"-1', '"3" - 1'], ['[5]*1', '[5] * 1'], ['{}*1', '{} * 1'],
  ['undefined+"x"', 'undefined + "x"'], ['null+"x"', 'null + "x"'], ['String(undefined)', 'String(undefined)'], ['String(null)', 'String(null)'],
  ['isNaN(undefined)', 'isNaN(undefined)'], ['isNaN("")', 'isNaN("")'], ['isFinite("12")', 'isFinite("12")'], ['-"3"', '-"3"'], ['+"3"', '+"3"'],
  ['"a"+-0', '"a" + -0'],
  // comparisons / equality / boolean
  ['"10"<"9"', '"10" < "9"'], ['10<"9"', '10 < "9"'], ['"a"<1', '"a" < 1'], ['undefined<1', 'undefined < 1'], ['null<1', 'null < 1'],
  ['null==undefined', 'null == undefined'], ['"1"==1', '"1" == 1'], ['0==""', '0 == ""'], ['null==0', 'null == 0'], ['undefined==0', 'undefined == 0'],
  ['NaN==NaN', '(0/0) == (0/0)'], ['"abc"==new String("abc")', '"abc" == new String("abc")'], ['true==1', 'true == 1'], ['"true"==true', '"true" == true'],
  ['1<=NaN', '1 <= (0/0)'], ['1>=NaN', '1 >= (0/0)'], ['NaN<=1', '(0/0) <= 1'], ['undefined<=1', 'undefined <= 1'], ['undefined>=0', 'undefined >= 0'],
  ['!"0"', '!"0"'], ['!""', '!""'], ['!"false"', '!"false"'], ['!NaN', '!(0/0)'], ['!new Object()', '!new Object()'], ['!undefined', '!undefined'],
  ['!null', '!null'], ['Boolean("0")', 'Boolean("0")'], ['Boolean(" ")', 'Boolean(" ")'], ['!-0', '!-0'],
  // Math misc
  ['min(1,NaN)', 'Math.min(1, 0/0)'], ['max()', 'Math.max()'], ['min()', 'Math.min()'], ['1/abs(-0)', '1 / Math.abs(-0)'],
  ['sqrt(-1)', 'Math.sqrt(-1)'], ['pow(0,0)', 'Math.pow(0, 0)'], ['pow(-8,1/3)', 'Math.pow(-8, 1 / 3)'], ['atan2(0,-0)', 'Math.atan2(0, -0)'],
  ['atan2(1,1)', 'Math.atan2(1, 1)'], ['atan2(0,0*-1)', 'Math.atan2(0, 0 * -1)'], ['1/ceil(-0.5*1)', '1 / Math.ceil(-0.5 * 1)'],
  ['1/(0*-1)', '1 / (0 * -1)'], ['1/round(-0.2*1)', '1 / Math.round(-0.2 * 1)'], ['1/int(-0.5*1)', '1 / int(-0.5 * 1)'], ['sin(PI)', 'Math.sin(Math.PI)'], ['cos(PI/2)', 'Math.cos(Math.PI / 2)'], ['sqrt(2)', 'Math.sqrt(2)'],
  ['PI', 'Math.PI'], ['SQRT1_2', 'Math.SQRT1_2'], ['-sin(PI/4)', '-Math.sin(Math.PI / 4)'], ['min(1,"0")', 'Math.min(1, "0")'],
  ['max(undefined,1)', 'Math.max(undefined, 1)'], ['abs("-3")', 'Math.abs("-3")'], ['exp(1)', 'Math.exp(1)'], ['log(10)', 'Math.log(10)'],
  // strings
  ['"abc".charAt(5)', '"abc".charAt(5)'], ['"abc".substr(-1)', '"abc".substr(-1)'], ['"abc".substring(2,1)', '"abc".substring(2, 1)'],
  ['"abc".slice(-2)', '"abc".slice(-2)'], ['"a,b,,c".split(",").length', '"a,b,,c".split(",").length'], ['"abc".split("").length', '"abc".split("").length'],
  ['"abc".split().length', '"abc".split().length'], ['"abc".charCodeAt(5)', '"abc".charCodeAt(5)'], ['"aXbX".indexOf("X",-5)', '"aXbX".indexOf("X", -5)'],
  ['"abc".substr(1,-1)', '"abc".substr(1, -1)'], ['"Abc".toUpperCase()', '"Abc".toUpperCase()'], ['"abc".length', '"abc".length'],
];

/** Golden key for a case label ('=' is the PROBE key/value separator, so comparisons are spelled out). */
export const caseKey = (label: string): string => label.replace(/==/g, ' eq ').replace(/<=/g, ' le ').replace(/>=/g, ' ge ');
const caseLines = (cases: [string, string][]): string => cases.map(([k, e]) => `P(${JSON.stringify(caseKey(k))}, ${e});`).join('\n');

export const P6_SRC = PRELUDE + caseLines(P6_CASES) + '\ntrace("PROBE:END");';
export const P7_SRC = PRELUDE + caseLines(P7_CASES) + '\ntrace("PROBE:END");';

export const p6: ProbeDef = {
  id: 'p6_numtostr',
  title: 'Number to String conversion',
  build: () => singleFrameSwf(compileAS(P6_SRC)),
};

export const p7: ProbeDef = {
  id: 'p7_math',
  title: 'Math.round/floor/ceil, int(), %, bitwise, string->number, comparisons',
  build: () => singleFrameSwf(compileAS(P7_SRC)),
};
