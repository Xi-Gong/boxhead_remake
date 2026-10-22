// Small raised strips. All edges fit inside the requested bounds (no expanding stroke).
export function raisedMeter(c:any,width:number,height:number,fraction:number,face:number,light:number,dark:number):void{
 const rect=(x:number,y:number,w:number,h:number,color:number)=>{
  if(w<=0||h<=0)return;c.beginFill(color,100);c.moveTo(x,y);c.lineTo(x+w,y);c.lineTo(x+w,y+h);c.lineTo(x,y+h);c.lineTo(x,y);c.endFill();
 };
 c.clear();c.lineStyle();rect(0,0,width,height,0x211d26);rect(.5,.5,width-1,height-1,0x493b4b);
 const fill=Math.max(.75,(width-2)*Math.max(0,Math.min(1,fraction)));
 rect(1,.75,fill,height-1.5,face);rect(1,.5,fill,.75,light);rect(1,height-1.25,fill,.75,dark);
}
