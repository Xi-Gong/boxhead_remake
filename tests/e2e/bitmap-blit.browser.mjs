// Compare the repeated clear-border blit against a fresh source using the original coverage path.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v028/bitmap-blit';mkdirSync(out,{recursive:true});
const browser=await launch();let g;
try{
 g=await openGame(browser);await toMainMenu(g);
 const report=await g.eval(()=>{
  const B=window.__game.BitmapData,root=window.__game.player.root,M=root.transform.matrix.constructor,C=root.transform.colorTransform.constructor;
  let cases=0,blits=0;
  for(const scale of [1,2]){
   const src=new B(7,6,true,0,{scale}),R=src.rectangle.constructor;
   src.fillRect(new R(1,1,5,4),0x9f36ad7b);src.setPixel32(2,2,0xffee3366);src.setPixel32(4,3,0x381234ef);
   const temp=new B(16,16,true,0,{scale});
   for(let i=0;i<8;i++)temp.draw(src,new M(1,0,0,1,2.25,2.25));
   const canvas=temp.toImageSource(),ctx=canvas.getContext('2d'),draw=ctx.drawImage;
   ctx.drawImage=function(...args){blits++;return draw.apply(this,args);};
   temp.draw(src,new M(1,0,0,1,2.25,2.25));
   ctx.drawImage=draw;temp.dispose();
   for(const mutation of [false,true]){
    if(mutation)src.setPixel32(0,1,0x80ff9933);
    for(const tx of [-.75,-.5,-.25,0,.25,.5,.75])for(const ty of [-.75,-.5,-.25,0,.25,.5,.75])
    for(const alpha of [1,.5])for(const smooth of [false,true])for(const clipped of [false,true]){
     const actual=new B(12,12,true,0x6149872a,{scale}),expected=actual.clone(),reference=src.clone();
     const m=new M(1,0,0,1,tx,ty),cx=alpha===1?undefined:new C(1,1,1,alpha),clip=clipped?new R(1,1,6,6):undefined;
     expected.draw(reference,m,cx,'normal',clip,smooth);actual.draw(src,m,cx,'normal',clip,smooth);
     const pixels=b=>b.toImageSource().getContext('2d').getImageData(0,0,b.deviceWidth,b.deviceHeight).data;
     const a=pixels(actual),e=pixels(expected);for(let i=0;i<a.length;i++)if(a[i]!==e[i])throw Error(JSON.stringify({scale,mutation,tx,ty,alpha,smooth,clipped,i,actual:a[i],expected:e[i]}));
     actual.dispose();expected.dispose();reference.dispose();cases++;
    }
   }
   src.dispose();
  }
  return {ok:true,cases,blits};
 });
 assert.equal(report.blits,2,'one blit per primed transparent-border source');
 assert.deepEqual(g.log,[]);writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(report);
}finally{await g?.close();await browser.close();}
