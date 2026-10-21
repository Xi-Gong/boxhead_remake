# ⏱️ v0.3.1 — Continuous survival, Boss waves and sharper combat

Survive, build, and break the horde. This stable release includes the changes since v0.2.9 and the intervening v0.3.0 prereleases.

## 🌊 Survive the clock and build your run

- Ordinary waves have **3, 4 or 5 minute survival limits** according to map size. Clear the finite enemy objective to finish early, or survive until time runs out. Enemies keep arriving from nearby reachable entrances or warned safe ground, with a fast opening and a stronger final phase.
- Every fifth wave brings **one extra minute** and an escalating encounter: one Boss at waves 5/10, two at 15/20 and at most three from wave 25. Defeat every Boss to advance immediately, or survive the limit for the normal reward. The clock sits inside WAVE and freezes during pause/disconnect holds.
- Each player chooses one of three upgrades between waves, within **12 seconds**. Firepower, vitality, shield and magazine bonuses accumulate; first aid and resupply restore current resources. Everyone confirming starts the next wave immediately.
- Defeating all Bosses doubles each player's one selected reward. Timeout clearing grants no extra kill XP or drops, while map objects, placed equipment and existing supply crates remain.

## 👹 Meet the Bone Tyrant and Ember Lord

- The **Bone Tyrant** gains a second independently warned and aimed charge below half health. The **Ember Lord** lays three fire marks and casts more frequently below half health. Ordinary nonfatal hits do not interrupt Boss skills.
- At most four ordinary zombie reinforcements accompany a Boss. Disabling devils selects the Tyrant for every Boss wave.
- Each Boss has one compact, numeric-free overhead health bar and counts under DEVIL. Bars follow the Boss and use confirmed health in LAN play.
- Bone Chargers and Ember Priests retain their distinct ordinary skills. Refined bone armor, rust bracers, layered crowns, molten seams and the Lord's furnace chest follow the original body animation.
- Charge warnings reflect the real hit radius and stop at static obstacles. Fire warnings remain visible at LOW detail. Timed arrivals appear before their first stationary spell.

## 🔫 Clearer guns, bullets and trajectories

- All five held guns have independent refined geometry and material separation: steel pistol, boxy UZI, warm shotgun furniture, olive rocket tube and twin-rail heavy gun.
- Warm bullet/pellet tracers, cyan rail cores, directional rockets and short matching muzzle effects distinguish ordinary and enchanted fire. Resolved hitscan traces stay aligned with their original muzzle and impact line.
- Four character skins, original animation sequences and exact gameplay anchors are retained. Art does not change weapon damage, rate, range, spread or collision, and original assets/classic fixtures remain available.

## 📦 Also included since stable v0.2.9

- Tiered personal growth: inexpensive basic levels, then progressively slower elite levels with stronger health/shield, damage and finite-ammo rewards. Existing saved runs retain their prior curve; weapon milestones remain. Growth continues beyond level 125 and wave selection beyond 100, with bounded high-wave initialization. Timed selected-wave builds now account for map duration and spawn pacing without replaying every previous wave.
- Purple priest crates enchant the held weapon for **35% extra damage** and additional ordinary-bullet penetration. Supplies, upgrades, switching, saves and recovery crates preserve a nonempty weapon's enchantment; depletion ends it, including after a later refill.
- Supplies preserve inherited capacities, single-weapon rewards refill the right weapon, and confirmed P1/P2 pickup messages keep stable spacing. Main-menu and conditional LAN controls have clearer layouts.
- Optional save extensions preserve timers, drafts and Boss state. Old saves migrate once without refilling current health, armor or ammunition. LAN negotiates optional new rules; older peers and death match retain their supported behavior.

Windows portable: **Boxhead 2Play Rooms-0.3.1-portable.exe**. Saves and settings remain in `%USERPROFILE%\.boxhead`.

The authorized streamlined release gate passed: **1,719 Vitest tests**, all three TypeScript configurations and production build, **188 browser UI checks**, **49 audio checks**, a real delayed-input packaged LAN pair, packaged native window/input/fullscreen/persistence checks and the actual portable EXE. Existing conditional skips remain unchanged. LAN checks cover common confirmed gameplay/sound/decal identities, multiple Bosses, partial defeat, real disconnect recovery, doubled-reward deduplication and checkpoint retry. Historical version-by-version duplicate runs and the rendered performance/stress matrix were omitted as agreed; no gameplay/LAN performance improvement is claimed. The portable extraction matches all current runtime files; SHA256 is provided alongside the download.

[Detailed changes and verification (Chinese)](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.1/PARITY.md)

**Full changelog:** [v0.2.9...v0.3.1](https://github.com/Xi-Gong/boxhead_remake/compare/v0.2.9...v0.3.1)
