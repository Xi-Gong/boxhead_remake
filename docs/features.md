[Back to README](../README.md)

## Beyond the original

<p align="center"><img src="../assets/readme/coop-crate.png" alt="Coop death weapon crate" width="640"></p>

- **Save & resume** — pause-menu **SAVE & QUIT**, main-menu **CONTINUE**; death **RETRY** restores the failed
  wave's starting checkpoint, or the run's starting state when no wave checkpoint exists yet, including its
  progression, score and inventory.
- **Coop death weapon crate** — a fallen player drops their whole arsenal with live ammo; pickup restores the
  owner exactly and gives the teammate the best of both.
- **Devil supplies** — every devil drops one equally likely blue armor, olive ammunition or bright green medical
  crate. These crates stay across waves and saves until a living player can benefit. Armor fills only armor,
  medical fills only health, and ammunition fills all owned weapons without unlocking new ones. Full players
  leave the crate for later or for their teammate. Modern LAN peers negotiate these rules; older peers retain
  their supported rules.
- **Red boxes** — 10% armor, 10% ammunition, 10% medical effects, otherwise the original weighted pool of owned
  weapons without its old healing entry. A full or empty reward still consumes the box, with no reroll.
  Fixed boxes return after 24 seconds. Every 20 simulation seconds, 1 solo or 2 co-op boxes appear on reachable,
  empty floor, up to 3/6 active random boxes. These last 45 seconds; pausing stops the timer.
- **Start-wave input** — type an ASCII decimal number or use the arrows; the range is 1 through the historical
  `BEST` wave, capped at 100. Leading zeros are normalized. Invalid text opens an in-game prompt and cancels
  starting or switching; Enter/blur commits, Escape restores the last valid value. Each visit starts at wave 1,
  and typing never unlocks waves. The LAN host edits against their own save cap; the guest sees a readonly value.
- **Personal PvE progression** — solo, local co-op and LAN share last-hit scores, permanent levels and weapon upgrades
  for each player. Zombies award 1 XP and devils 5 XP; level requirements begin at 5 XP and rise by 5 every ten
  levels, up to level 125. Top corner
  score/level/XP panels flank the current wave and its remaining zombie/devil totals (including pending spawns),
  with individual upgrade summaries while paused. Retry restores the current wave's starting growth and
  inventory; a fresh selected-wave run grants its baseline level from the same earned-wave curve, respecting
  the difficulty head start. Kill scores use the level before that kill's upgrade. Local co-op keeps its shared
  camera and controls; death match retains its rules. Old v2 local saves convert once while preserving total
  score, current health/armor, weapons and ammo; co-op splits old score equally, with any odd point going to P1.
- **Growing survivability** — health and armor caps are both `200 + 4 × (level − 1)` (200/396/696 at levels
  1/50/125). A living level-up adds only the health-cap difference; armor does not refill. Enemy melee and
  fireballs do not interrupt or knock back a player who had armor before the hit, even if that hit breaks it.
  Damage still spills into health, and lethal hits still kill. Co-op respawn keeps level, fills health and
  clears armor; natural health regeneration is unchanged.
- **Four PvE difficulty curves** — Single and co-op tune spawn pacing, active enemy caps and speed ceilings for
  Beginner, Intermediate, Expert and Nightmare. Per-wave kill budgets, enemy health/damage and weapon upgrades
  stay intact, so stronger weapons keep their impact. LAN enables the tuning only after capability negotiation.
  See the [balance audit and explosion measurements](verification/v0.2.8/README.md).
- **LAN multiplayer** (portable build) — host & auto-discover or join by IP for co-op and death match.
  Rollback applies local input on the next simulation tick without waiting for the peer, with immediate local
  weapon audio and display interpolation at the monitor's refresh rate. Redundant UDP inputs use TCP as a
  reliable fallback. Short disconnects recover from input history; a restarted peer resumes from a checkpoint
  within the 30 s reconnect window. Either player can RETRY from the debrief. Confirmed gameplay remains
  deterministic; prediction may visibly correct under poor links. See the [measurements and tradeoffs](verification/v0.2.7/README.md).
- **Room settings** — the host can edit difficulty, speed, devils, player collisions, friendly fire and applicable
  victory conditions in the waiting room and setup; the guest sees changes immediately. Rules are fixed once
  play starts and retained on resume. With co-op friendly fire disabled, player shots pass through teammates;
  movement collision remains a separate option.
- **Presentation and audio** — confirmed kill scores animate once toward the owner's actual score panel, with
  pause and resize support. Explosion screen flashes are softened while blast art and gameplay remain intact.
  Audio retries startup and recovers stalled or failed output automatically, retaining the mute setting.
- **One data folder** — every build (the portable exe included) keeps all user game data — saves and settings —
  in `%USERPROFILE%\.boxhead`, migrated there automatically on first run: one folder to manage and back up.

<p align="center"><img src="../assets/readme/lan-growth.png" alt="Personal LAN co-op progression" width="640"></p>

<p align="center"><img src="../assets/readme/devil-supplies.png" alt="Blue armor and olive ammunition supplies" width="640"></p>

Intentional deviations are registered in [`src/game/deviations.ts`](../src/game/deviations.ts) and audited in
[`PARITY.md`](../PARITY.md): sponsor content (CMG logo, online scores, external links) is replaced by local
highscores; timing stays at the original 50 fps logic on any refresh rate.
