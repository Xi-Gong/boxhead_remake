# 🧟 v0.3.3 — Fewer enemies, sharper fights

## ✨ Highlights

- Simplified PvE roster: original zombies, Bone Chargers and original fireball devils. Every fifth wave retains 1–3 charger/devil Bosses, with two ordinary reinforcements at a time.
- Enemy armor is gone. Bosses use compact, body-sized health bars; player bars keep their original appearance.
- Red boxes replenish unlocked weapons. Every devil and devil Boss drops one permanent medical, armor, enchantment or ammunition crate, each with a 25% chance.
- Separate health/shield growth starts at 160/60 capacity with an empty shield. Smaller level gains and +8%/+6% upgrade choices make shield breaks matter.
- Enchantment grants +15% damage, two-target ordinary bullets and normal explosion falloff. Persistent enchantment and depletion behavior remain intact.
- Seven permanent build stats replace ineffective armor piercing. Existing piercing points and pending cards become firepower.
- Ordinary clear objectives and starting-wave experience now use the actual map deadline. Finite clears, doubled early Boss rewards and timed survival remain available.

## 📦 Saves and compatibility

Existing runs migrate immediately while preserving earned progression, inventory, remaining vital fractions and clocks. Retired enemies convert by family; saved enchantment damage converts once. The v2 save container is retained. LAN negotiates `combat-pve-v3`; older peers keep their supported rules, and death match retains its rules.

The final review also fixed legacy ammunition being truncated on the first live update after loading. Surplus above the new refill capacity remains usable and finite through supplies, upgrades and death-crate recovery.

The candidate code review removed retired warning scans and unused previews, and repaired legacy enemy-art loading after negotiation. No performance benchmark result is claimed.

## ✅ Validation

All 1,807 tests passed, with 71 existing skips. Browser UI/audio, hidden Electron/native, actual portable EXE and isolated functional LAN gates passed. Scripted real keyboard play demonstrated ordinary and Boss early clears on all four difficulties, with three Nightmare boot seeds; deaths and timeouts remain in the records. These results are not human win rates.

Portable SHA256: `405dc84d399cfbb79377e1516ffe3a4262cef054fef691b8f174f735f8e6fe67`.

The published EXE was downloaded again and verified against this hash and version 0.3.3. See the [publication receipt](https://github.com/Xi-Gong/boxhead_remake/blob/main/docs/verification/v0.3.3/publication.json).

See [release verification](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.3/docs/verification/v0.3.3/README.md) and the Chinese [parity record](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.3/PARITY.md).

**Full changelog:** https://github.com/Xi-Gong/boxhead_remake/compare/v0.3.2...v0.3.3
