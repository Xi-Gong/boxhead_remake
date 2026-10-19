// Historical LAN acceptance must exercise the same focus and keyboard path as a player.
import assert from 'node:assert/strict';
const functional=process.env.BOXHEAD_QA_FUNCTIONAL_ONLY==='1';
export const lanWindowFlag=functional?'--boxhead-hidden':'--window-position=-32000,0';
export async function placeLanWindow(app,page,{nativeResize=false}={}){
 try{
  if(functional&&!nativeResize)await page.setViewportSize({width:640,height:480});
  await app.evaluate(({BrowserWindow,screen},functional)=>{
   const w=BrowserWindow.getAllWindows()[0];
   if(functional){
    if(w.getOpacity()!==0||w.isFocusable())throw new Error('Functional QA must be transparent and non-focusable from creation');
    const area=screen.getPrimaryDisplay().workArea;w.setPosition(area.x+40,area.y+40);w.setContentSize(640,480);
   }else w.setPosition(-32000,0);
   w.setAlwaysOnTop(false);
  },functional);
 }catch(error){await app.close().catch(()=>{});throw error;}
}
export async function typeLanAddress(page,address){
 const input=page.getByPlaceholder('192.168.x.x');
 await input.waitFor({state:'visible',timeout:15000});
 await input.click();await page.keyboard.press('Control+A');await page.keyboard.type(address);
 assert.equal(await input.inputValue(),address,'manual IP follows real typing');
 assert(await input.evaluate(e=>document.activeElement===e),'manual IP keeps keyboard focus');
}
