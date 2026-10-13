// Port of projects/boxhead4/System/CContextMenu.as
// Structure from generated/disasm/System.CContextMenu.txt top-level script @497607..@498772 (initaction of sprite 846).
// Builds the right-click menu on `_root.menu`: "(c) Sean Cooper 2007" + Sound / Music / Quality toggles bound to the
// save data. The platform (src/engine/platform/ContextMenu.ts) shows `_root.menu` as an HTML menu.
import { ContextMenu, ContextMenuItem, _root, getURL, proto } from '../../engine/runtime.ts';
import { CSaveData, External, registerGameClass } from '../packages.ts';

export class CContextMenu {
  [key: string]: any;

  static Loading(): any {
    let _loc2_: any = undefined;
    const _loc4_ = function (obj: any, item: any): void {
      void obj; void item;
      External.CTracker.Click_SeanTCooper();
      getURL('http://www.games.seantcooper.com', '_blank');
    };
    const _loc3_ = function (obj: any, menuObj: any): void {
      void obj; void menuObj;
    };
    _loc2_ = new ContextMenu(_loc3_); // [BC] generated/disasm/System.CContextMenu.txt @497857 (ffdec: `new ContextMenu(0)`)
    _loc2_.hideBuiltInItems();
    _loc2_.customItems.push(new ContextMenuItem('© Sean Cooper 2007', _loc4_));
    _root.menu = _loc2_;
    return _loc2_;
  }

  static InGame(): any {
    const _loc2_ = CContextMenu.Loading();
    const _loc7_ = function (obj: any, item: any): void {
      void obj;
      CSaveData._this.__set__mSoundActive(!CSaveData._this.__get__mSoundActive());
      const _loc1_ = !CSaveData._this.__get__mSoundActive() ? 'OFF' : 'ON';
      item.caption = 'Sound: ' + _loc1_;
    };
    const _loc4_ = function (obj: any, item: any): void {
      void obj;
      CSaveData._this.__set__mMusicActive(!CSaveData._this.__get__mMusicActive());
      const _loc1_ = !CSaveData._this.__get__mMusicActive() ? 'OFF' : 'ON';
      item.caption = 'Music: ' + _loc1_;
    };
    const _loc6_ = function (obj: any, item: any): void {
      void obj;
      CSaveData._this.__set__mDetail(!CSaveData._this.__get__mDetail());
      const _loc1_ = !CSaveData._this.__get__mDetail() ? 'LOW' : 'BEST';
      item.caption = 'Quality: ' + _loc1_;
    };
    const _loc10_ = !CSaveData._this.__get__mSoundActive() ? 'OFF' : 'ON';
    const _loc8_ = !CSaveData._this.__get__mMusicActive() ? 'OFF' : 'ON';
    const _loc9_ = !CSaveData._this.__get__mDetail() ? 'LOW' : 'BEST';
    const _loc3_ = new ContextMenuItem('Sound: ' + _loc10_, _loc7_);
    _loc3_.separatorBefore = true;
    _loc2_.customItems.push(_loc3_);
    _loc2_.customItems.push(new ContextMenuItem('Music: ' + _loc8_, _loc4_));
    _loc2_.customItems.push(new ContextMenuItem('Quality: ' + _loc9_, _loc6_));
    _root.menu = _loc2_;
    return _loc2_;
  }
}
proto(CContextMenu, { _CLASSID_: 'CContextMenu' });

registerGameClass('System.CContextMenu', CContextMenu);
