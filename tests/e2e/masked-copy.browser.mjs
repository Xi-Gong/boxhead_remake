// Opaque-region mask fast path versus an identical cloned mask using the original scratch composition.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v028/masked-copy';mkdirSync(out,{recursive:true});
const browser=await launch();let g;
try{
 g=await openGame(browser);await toMainMenu(g);
 const report=await g.eval(()=>{
  const B=window.__game.BitmapData,root=window.__game.player.root,P=window.__game.pkg.DrawPrimitive.CDrawPrimitive.zPoint.constructor;
  let cases=0,fast=0;
  const pixelBytes=b=>b.toImageSource().getContext('2d').getImageData(0,0,b.deviceWidth,b.deviceHeight).data;
  const compare=(mask,reference,srcScale,dstScale,merge,transparent,where,rectOffset)=>{
   const src=new B(9,7,true,0,{scale:srcScale}),R=src.rectangle.constructor;
   for(let y=0;y<7;y++)for(let x=0;x<9;x++)src.setPixel32(x,y,([0x013d77c0,0x8036ad7b,0xffee4466,0x00ffffff][(x+y)%4]>>>0));
   const a=new B(24,24,transparent,0x7349872a,{scale:dstScale}),e=a.clone(),copy=a.copyPlain;
   a.copyPlain=function(...args){fast++;return copy.apply(this,args);};
   const [dx,dy,mx,my]=where,rect=new R(rectOffset,rectOffset,9,7),before=a.version,beforeReference=e.version;
   e.copyPixels(src,rect,new P(dx,dy),reference,new P(mx,my),merge);
   a.copyPixels(src,rect,new P(dx,dy),mask,new P(mx,my),merge);
   const actual=pixelBytes(a),expected=pixelBytes(e);
   for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])throw Error(JSON.stringify({case:cases,srcScale,dstScale,maskScale:mask.scale,merge,transparent,where,rectOffset,i,actual:actual[i],expected:expected[i]}));
   if(a.version-before!==e.version-beforeReference)throw Error('mutation version drift');
   a.dispose();e.dispose();src.dispose();cases++;
  };
  for(const maskScale of [1,2])for(const tiled of [false,true]){
   const oldMax=B.maxCanvasSize,oldTile=B.tileSize;if(tiled){B.maxCanvasSize=16;B.tileSize=16;}
   const mask=new B(33,31,true,0xffffffff,{scale:maskScale,alphaOnly:true});
   try{
    for(const phase of ['opaque','wall','mutated','rebuilt']){
     const R=mask.rectangle.constructor;
     if(phase==='wall')mask.fillRect(new R(0,0,16,16),0);
     if(phase==='mutated')mask.setPixel32(20,20,0x80ffffff);
     if(phase!=='mutated')mask.paletteMap(mask,mask.rectangle,new P(0,0));
     const reference=mask.clone(),start=fast;
     for(const srcScale of [1,2])for(const dstScale of [1,2])for(const merge of [false,true])for(const transparent of [false,true])
      for(const where of [[1,1,1,1],[-2,4,-3,1],[17,17,28,26],[5,5,16,16]])for(const rectOffset of [-1,0,2])compare(mask,reference,srcScale,dstScale,merge,transparent,where,rectOffset);
     if(phase==='opaque'&&fast===start)throw Error('opaque mask fast path did not execute');
     if(phase==='mutated'&&fast!==start)throw Error('changed masks must invalidate the grid');
     reference.dispose();
    }
   }finally{mask.dispose();B.maxCanvasSize=oldMax;B.tileSize=oldTile;}
  }
  // Exercise the 2048px processing chunk and the automatic tiled backing at 2x.
  for(const scale of [1,2]){
   const mask=new B(2051,33,true,0xffffffff,{scale,alphaOnly:true});mask.paletteMap(mask,mask.rectangle,new P(0,0));
   const reference=mask.clone();compare(mask,reference,2,2,true,true,[1,1,2045,20],0);reference.dispose();mask.dispose();
  }
  return {ok:true,cases,fast};
 });
 assert(report.fast>0);assert.deepEqual(g.log,[]);writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(report);
}finally{await g?.close();await browser.close();}

