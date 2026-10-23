# 🧟 Start strong, build for the horde

## 🔫 A gentler opening

- First-wave ordinary zombies take **two base pistol hits on every difficulty**. Early groups are smaller; enemy health and crowd size increase gradually into later waves.
- Face **2–4 Bosses** with less combined health. Preserve reachable entrances and partially defeated encounters through recovery.
- Raise every finite weapon's authored base ammunition to **125%, rounded up**: UZI 125, shotgun/rocket/grenade 25, railgun 19, barrel/mine/remote charges 13 and fake wall 7. Keep previously earned surplus ammunition.
- Shorten the shotgun's base cooldown from **18 to 14 simulation ticks**. Held firearm input continues firing at its normal cooldown.

## 🌱 Plan your percentages

- Show additive percentage bonuses and exact before/after values on upgrade cards and stat sheets, with explicit attribute caps.
- Add **dodge**, gaining 3 percentage points per ordinary pick up to **50%**. A successful dodge avoids the complete eligible hit, including armor loss and hit reaction.
- Clear a finite objective before its deadline for a **double upgrade**. Surviving the deadline gives one; Boss victory gives two. Kills still determine earned XP, and careful build choices matter as pressure rises.
- Preserve existing saved allocations, ammunition and depleted enchantments. Save/continue, rollback and retry retain reward provenance and prevent duplicate rewards.

## 🎮 Menus, controls and LAN

- All difficulties enter the exact selected starting wave; Wave 1 starts at level 1 with the pistol.
- Retain controller letter layouts, independent local/LAN stat inspection, weapon bindings and empty-weapon feedback.
- Negotiate the new rules independently with LAN peers. Preserve exact legacy weapon arithmetic for compatible checksums.

## ✅ Verification

See the [verification record](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.6/docs/verification/v0.3.6/README.md) for the exact functional results, artifact identity, retained failure records and coverage limits. All 32 serial functional gates passed, covering real menu and keyboard input, browser/audio, saves and retries, hidden Electron/portable startup, and isolated two-process localhost LAN at 30/60/100ms. Disconnect recovery and retry are covered separately and in the extended 30ms case. Controller injection verifies mappings; physical controllers and performance benchmarks are outside this acceptance.

[PARITY details](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.6/PARITY.md) · [Full changelog](https://github.com/Xi-Gong/boxhead_remake/compare/v0.3.5...v0.3.6)
