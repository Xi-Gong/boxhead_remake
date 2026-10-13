// Port of projects/boxhead4/DrawPrimitive/XSI/CDrawPrimitive_XSI_StyleSheet.as
// Character skins. Each SS_* starts from GetStyleSheet("Player_Handgun_Walk") (a copy of all master materials and
// one {mGroup_Remap, mVisible} entry per model name), hides/remaps models, swaps the bitmap material symbols and
// recolours the solid materials, then SS_APPLY makes it the active style sheet of the XSI_DI renderer.
// SS_* bodies are a statement-by-statement transcription of generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.txt
// (@254196..@257379). The `.as` class prologue (16 lines) is explained in generated/reports/hotspots.md.
import { flash, proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, registerGameClass } from '../../packages.ts';

export class CDrawPrimitive_XSI_StyleSheet {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  static mDefault_AnimID = 'Player_Handgun_Walk';
  /** The CDrawPrimitive_XSI_DI instance (set by its constructor). */
  static mXSI_DI: any;

  constructor() {
  }

  static SS_FINALIZE(tStyleSheet: any): void {
    if (tStyleSheet.mScalarMatrix) {
      return;
    }
    tStyleSheet.mScalarMatrix = new flash.geom.Matrix();
    tStyleSheet.mScalarMatrix.scale(tStyleSheet.mScale, tStyleSheet.mScale);
  }

  static SS_APPLY(tStyleSheet: any): void {
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_FINALIZE(tStyleSheet);
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI.ApplyStyleSheet(tStyleSheet);
  }

  static SS_BAMBO(): void {
    const _loc1_ = DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI.GetStyleSheet(DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mDefault_AnimID);
    _loc1_.mID = 'SS_BAMBO';
    _loc1_.mModels.GunPosition_Right.mVisible = false;
    _loc1_.mModels.Body_Front.mVisible = false;
    _loc1_.mModels.Body_Back.mVisible = false;
    _loc1_.mMaterials.Body_Back.mcLinkID = 'Bambo_Body_Back';
    _loc1_.mMaterials.Body_Front.mcLinkID = 'Bambo_Body_Front';
    _loc1_.mMaterials.Body_Side.mcLinkID = 'Bambo_Body_Side';
    _loc1_.mMaterials.Body_Top.mcLinkID = 'Bambo_Body_Top';
    _loc1_.mMaterials.Head_Back.mcLinkID = 'Bambo_Head_Back';
    _loc1_.mMaterials.Head_Front.mcLinkID = 'Bambo_Head_Front';
    _loc1_.mMaterials.Head_Side.mcLinkID = 'Bambo_Head_Side';
    _loc1_.mMaterials.Bandana.mColor = 16711680;
    _loc1_.mMaterials.LowerArm.mColor = 16764057;
    _loc1_.mMaterials.UpperArm.mColor = 16764057;
    _loc1_.mMaterials.Hand.mColor = 0;
    _loc1_.mMaterials.Hair.mColor = 0;
    _loc1_.mScale = 0.35;
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_APPLY(_loc1_);
  }

  static SS_BOND(): void {
    const _loc1_ = DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI.GetStyleSheet(DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mDefault_AnimID);
    _loc1_.mID = 'SS_BOND';
    _loc1_.mModels.GunPosition_Right.mVisible = false;
    _loc1_.mModels.Body_Front.mVisible = false;
    _loc1_.mModels.Body_Back.mVisible = false;
    _loc1_.mMaterials.Body_Back.mcLinkID = 'Bond_Body_Back';
    _loc1_.mMaterials.Body_Front.mcLinkID = 'Bond_Body_Front';
    _loc1_.mMaterials.Body_Side.mcLinkID = 'Bond_Body_Side';
    _loc1_.mMaterials.Body_Top.mcLinkID = 'Bond_Body_Top';
    _loc1_.mMaterials.Head_Back.mcLinkID = 'Bond_Head_Back';
    _loc1_.mMaterials.Head_Front.mcLinkID = 'Bond_Head_Front';
    _loc1_.mMaterials.Head_Side.mcLinkID = 'Bond_Head_Side';
    _loc1_.mMaterials.Bandana.mColor = 51;
    // AS2: write to a member of undefined (there is no "Cloth" material) -> silent no-op.
    if (_loc1_.mMaterials.Cloth != undefined) {
      _loc1_.mMaterials.Cloth.mColor = 51;
    }
    _loc1_.mMaterials.LowerArm.mColor = 51;
    _loc1_.mMaterials.UpperArm.mColor = 51;
    _loc1_.mMaterials.Hand.mColor = 0;
    _loc1_.mMaterials.Hair.mColor = 0;
    _loc1_.mScale = 0.35;
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_APPLY(_loc1_);
  }

  static SS_GIJOE(): void {
    const _loc1_ = DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI.GetStyleSheet(DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mDefault_AnimID);
    _loc1_.mID = 'SS_GIJOE';
    _loc1_.mModels.GunPosition_Right.mVisible = false;
    _loc1_.mGroup_Remap = 'Player_Alternate1';
    _loc1_.mModels.Head.mGroup_Remap = 'Player_Alternate1';
    _loc1_.mModels.Foot_Right.mGroup_Remap = 'Player_Alternate1';
    _loc1_.mModels.Foot_Left.mGroup_Remap = 'Player_Alternate1';
    _loc1_.mModels.Body_Front.mVisible = false;
    _loc1_.mModels.Body_Back.mVisible = false;
    _loc1_.mMaterials.Body_Back.mcLinkID = 'GIJOE_Body_Back';
    _loc1_.mMaterials.Body_Front.mcLinkID = 'GIJOE_Body_Front';
    _loc1_.mMaterials.Body_Side.mcLinkID = 'GIJOE_Body_Side';
    _loc1_.mMaterials.Body_Top.mcLinkID = 'GIJOE_Body_Top';
    _loc1_.mMaterials.Head_Back.mcLinkID = 'GIJOE_Head_Back';
    _loc1_.mMaterials.Head_Front.mcLinkID = 'GIJOE_Head_Front';
    _loc1_.mMaterials.Head_Side.mcLinkID = 'GIJOE_Head_Side';
    _loc1_.mMaterials.Hair.mColor = 0;
    _loc1_.mMaterials.Bandana.mColor = 14601386;
    // AS2: write to a member of undefined (there is no "Cloth" material) -> silent no-op.
    if (_loc1_.mMaterials.Cloth != undefined) {
      _loc1_.mMaterials.Cloth.mColor = 14601386;
    }
    _loc1_.mMaterials.LowerArm.mColor = 14601386;
    _loc1_.mMaterials.UpperArm.mColor = 14601386;
    _loc1_.mMaterials.Hand.mColor = 16764057;
    _loc1_.mScale = 0.35;
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_APPLY(_loc1_);
  }

  static SS_SWAT(): void {
    const _loc1_ = DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI.GetStyleSheet(DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mDefault_AnimID);
    _loc1_.mID = 'SS_SWAT';
    _loc1_.mModels.GunPosition_Right.mVisible = false;
    _loc1_.mGroup_Remap = 'Player_Alternate1';
    _loc1_.mModels.Head.mGroup_Remap = 'Player_Alternate1';
    _loc1_.mModels.Foot_Right.mGroup_Remap = 'Player_Alternate1';
    _loc1_.mModels.Foot_Left.mGroup_Remap = 'Player_Alternate1';
    _loc1_.mModels.Body_Front.mVisible = false;
    _loc1_.mModels.Body_Back.mVisible = false;
    _loc1_.mMaterials.Body_Back.mcLinkID = 'Swat_Body_Back';
    _loc1_.mMaterials.Body_Front.mcLinkID = 'Swat_Body_Front';
    _loc1_.mMaterials.Body_Side.mcLinkID = 'Swat_Body_Side';
    _loc1_.mMaterials.Body_Top.mcLinkID = 'Swat_Body_Top';
    _loc1_.mMaterials.Head_Back.mcLinkID = 'Swat_Head_Back';
    _loc1_.mMaterials.Head_Front.mcLinkID = 'Swat_Head_Front';
    _loc1_.mMaterials.Head_Side.mcLinkID = 'Swat_Head_Side';
    _loc1_.mMaterials.Bandana.mColor = 51;
    // AS2: write to a member of undefined (there is no "Cloth" material) -> silent no-op.
    if (_loc1_.mMaterials.Cloth != undefined) {
      _loc1_.mMaterials.Cloth.mColor = 51;
    }
    _loc1_.mMaterials.LowerArm.mColor = 51;
    _loc1_.mMaterials.UpperArm.mColor = 51;
    _loc1_.mMaterials.Hand.mColor = 0;
    _loc1_.mScale = 0.35;
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_APPLY(_loc1_);
  }

  static SS_ZOMBIE(): void {
    const _loc1_ = DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI.GetStyleSheet(DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mDefault_AnimID);
    _loc1_.mID = 'SS_ZOMBIE';
    _loc1_.mModels.Weapon_Right.mVisible = false;
    _loc1_.mModels.GunPosition_Right.mVisible = false;
    _loc1_.mGroup_Remap = 'Zombie';
    _loc1_.mModels.Head.mGroup_Remap = 'Zombie';
    _loc1_.mModels.Body_Front.mVisible = false;
    _loc1_.mModels.Body_Back.mVisible = false;
    _loc1_.mMaterials.Body_Back.mcLinkID = 'Zombie_Body_Back';
    _loc1_.mMaterials.Body_Front.mcLinkID = 'Zombie_Body_Front';
    _loc1_.mMaterials.Body_Side.mcLinkID = 'Zombie_Body_Side';
    _loc1_.mMaterials.Body_Top.mcLinkID = 'Zombie_Body_Top';
    _loc1_.mMaterials.Bandana.mColor = 11584734;
    _loc1_.mMaterials.LowerArm.mColor = 11584734;
    _loc1_.mMaterials.UpperArm.mColor = 16777215;
    _loc1_.mMaterials.Hand.mColor = 11584734;
    _loc1_.mScale = 0.35;
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_APPLY(_loc1_);
  }

  static SS_DEVIL(tScale?: any): void {
    const _loc1_ = DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI.GetStyleSheet(DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mDefault_AnimID);
    _loc1_.mID = 'SS_DEVIL';
    _loc1_.mModels.Weapon_Right.mVisible = false;
    _loc1_.mModels.GunPosition_Right.mVisible = false;
    _loc1_.mGroup_Remap = 'Devil';
    _loc1_.mModels.Head.mGroup_Remap = 'Devil';
    _loc1_.mModels.Body_Front.mVisible = false;
    _loc1_.mModels.Body_Back.mVisible = false;
    _loc1_.mMaterials.Body_Back.mcLinkID = 'Devil_Body_Back';
    _loc1_.mMaterials.Body_Front.mcLinkID = 'Devil_Body_Front';
    _loc1_.mMaterials.Body_Side.mcLinkID = 'Devil_Body_Side';
    _loc1_.mMaterials.Body_Top.mcLinkID = 'Devil_Body_Top';
    _loc1_.mMaterials.Bandana.mColor = 16711680;
    _loc1_.mMaterials.LowerArm.mColor = 16711680;
    _loc1_.mMaterials.UpperArm.mColor = 16711680;
    _loc1_.mMaterials.Hand.mColor = 0;
    _loc1_.mMaterials.Foot.mColor = 0;
    _loc1_.mScale = !tScale ? 0.44 : tScale;
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_APPLY(_loc1_);
  }

  static SS_DEFAULT(): void {
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI.ApplyStyleSheet();
  }
}
proto(CDrawPrimitive_XSI_StyleSheet, { _CLASSID_: 'CDrawPrimitive_XSI_StyleSheet', _BASECLASSID_: 'CDrawPrimitive_XSI_StyleSheet' });

registerGameClass('DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet', CDrawPrimitive_XSI_StyleSheet);
