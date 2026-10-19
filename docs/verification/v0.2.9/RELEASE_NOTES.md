# v0.2.9 — Grow together, keep the supplies coming

## 🎮 One progression system

- Solo and local co-op now share LAN's permanent personal levels, last-hit scores and weapon upgrades.
- Health and armor capacity grow with your level. Armor protects against enemy hit interruption, including the hit that breaks it.
- Existing local saves retain their score, current health, armor, weapons and ammo when upgraded.

## 📦 Supplies that stay useful

- Devils always drop one armor, ammo or medical crate, with equal odds. Special crates remain across waves and saves until someone needs them.
- Green medical crates have their own white-cross design. Ammo refills owned weapons; armor and medical effects refill only their respective resource.
- Red boxes can grant any of those effects, fixed boxes return sooner, and timed deliveries add more reachable supplies during play.

## 🛠️ Smoother play and easier setup

- Confirmed kill scores animate once toward the correct player's score panel, without rollback flicker.
- Type an unlocked starting wave directly, with full text validation, paste and IME handling.
- Hosts can change room settings before starting; with co-op friendly fire off, shots pass through teammates.
- Leaving or rebuilding a LAN room no longer lets a late discovery beacon trigger a main-process error dialog.
- Audio recovers from startup or output failures without restarting the game.
- Rocket, grenade, barrel, mine and other explosion screen flashes are substantially softer.
- Softened flashes retain the GPU rendering path, avoiding a full-screen CPU readback on each flash.

Death match keeps its existing progression and supply rules. Older LAN clients retain the rules their capabilities support.

Verification includes the initial candidate's complete functional and LAN matrix, targeted regressions for
the final beacon/flash fixes, and a lightweight final build and portable check. The planned three-round heavy
performance comparison was stopped to avoid interfering with office work; no overall speedup is claimed.

Windows portable: **Boxhead 2Play Rooms-0.2.9-portable.exe**. Saves remain in `%USERPROFILE%\.boxhead`.

[Detailed changes and verification (Chinese)](https://github.com/Xi-Gong/boxhead_remake/blob/v0.2.9/PARITY.md)

**Full changelog:** [v0.2.8...v0.2.9](https://github.com/Xi-Gong/boxhead_remake/compare/v0.2.8...v0.2.9)
