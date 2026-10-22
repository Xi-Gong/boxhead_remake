# 🎮 Follow the letters on your pad

## 🎨 Revised v0.3.5 HUD

- Restore **blue armor over the original green health bar**. Full armor covers it; partial armor reveals the remaining health. Armor values and full crate refills are unchanged.
- Match native devil Boss health-bar height to the player's health bar while retaining the shorter width and raised edges. Keep the compact enchantment strip unchanged.
- Give A/Y weapon labels a little more room: normally 4–5 visible pixels from the text.
- Refresh the screenshots and rebuild both Windows artifacts. This revision replaces the original v0.3.5 tag and downloads.

## ✨ Controls that match

- Follow the **printed A/B/X/Y letters** on Xbox and Nintendo layouts. Recognizable SN30/Switch names select Nintendo automatically; a saved **AUTO / XBOX / NINTENDO** selector handles controllers exposing a generic XInput name.
- **B/LT/RT** fire, **A/Y** bind or select weapons, **X** inspects stats between waves, and **A** confirms menus and upgrades. Switching layouts cancels pending holds and waits for release.
- Fix confirmation taps made while viewing stats leaking into READY when the sheet closes. Local co-op and independent LAN inspection retain their existing scope.

## 🔫 Empty guns, clear feedback

- The last successful finite shot or placement returns to the pistol. Unlocked empty weapons remain selectable and bindable, with a short alert when fired and bounded repeats while held.
- Preserve the final enchanted attack and remaining independent durability. Failed placements keep the held weapon; empty remote charges can still be selected and detonated.
- Keep v0.3.4 peer behavior through the optional `empty-weapon-feedback-v1` capability.
- Place binding letters closer to weapon names using the actual scaled text layout. Visible gap checks cover short names, empty stock and inherited large magazines.

## 💜 Enchantment grows with you

- Personal levels and **ENCHANT POWER** cards increase the enchantment's extra damage from 15% toward 45%, with diminishing returns. Boss rewards count twice; cards show exact before/after values. Already emitted attacks retain their original damage.
- New selected-wave builds include power; existing saved builds retain their earned allocations. Optional `enchant-power-v1` negotiation preserves older peers.
- Shorter raised strips respect player health proportions: enchantment is no wider than health and at most half its height; native Boss strips match player health height. Highlights and shadows fit inside the bounds.
- Retain enemy growth after bounded four-difficulty comparisons; the added power remains constrained by finite enchantment durability and upgrade choices.

## 🖼️ Verification and current screenshots

Both READMEs refresh the running-game gallery and show the saved Nintendo layout. Release acceptance includes serial functional tests, three viewport sizes, real menu/dropdown clicks, injected controller mappings, delayed packaged LAN and actual portable launches. See the [verification record](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.5/docs/verification/v0.3.5/README.md) for exact results and hardware limitations.

[PARITY details](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.5/PARITY.md) · [Full changelog](https://github.com/Xi-Gong/boxhead_remake/compare/v0.3.4...v0.3.5)
