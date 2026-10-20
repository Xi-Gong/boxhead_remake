[Back to README](../README.md)

## Beyond the original

### Timed waves, Bosses and run upgrades

Solo, local co-op and compatible LAN co-op loop indefinitely. Death match retains its rules.

| Map size | Ordinary wave | Every fifth wave: Boss |
|---|---:|---:|
| Small: maps 1, 2, 4, 8 | 3 minutes | 4 minutes |
| Medium: remaining maps | 4 minutes | 5 minutes |
| Large/long: maps 14–18 | 5 minutes | 6 minutes |

The longest side at least 64 cells or area above 2,000 cells makes a map large; at most 800 cells and longest side at most 40 makes it small. Menus show the time limit. The simulation clock stops on pause/disconnect freezes. Survive the limit to advance; defeating every Boss advances immediately. Death on the last tick is still defeat.

Ordinary waves continuously replenish enemies within difficulty/detail concurrency caps, with a quick opening and faster late-wave arrivals. Nearby reachable entrances are preferred; safe ground arrivals warn for 0.8 seconds. Timeouts clear enemies, projectiles and fire damage without kill rewards. Map objects, placed equipment and existing supply crates remain.

Each player gets three choices between waves, with **12 seconds** to confirm. Everyone confirming advances immediately; timeout takes the displayed default **Firepower**. Move/weapon-switch controls select, fire confirms, or click a card. Holding fire from combat does not automatically confirm. Combat, regeneration and supply timers freeze during selection.

| Upgrade | One reward |
|---|---|
| Firepower | +8% weapon damage bonus |
| Vitality | +10% maximum-health bonus; living players receive the added capacity |
| Shield | +10% maximum-armor bonus; no instant refill |
| Magazine | +15% finite-ammo capacity bonus; receive the added capacity |
| First aid | Restore 35% maximum health |
| Resupply | Restore 35% maximum capacity for owned weapons |

Bonuses accumulate within the run and survive saves, retries and respawns. New runs reset them. Firepower is always offered; two distinct seeded alternatives exclude useless heals/refills. Selected high waves distribute the four permanent bonuses evenly and derive baseline XP from map duration and spawn pacing without replaying earlier waves or assuming Boss rewards.

**Bone Tyrant / Ember Lord** alternate every five waves, with at most four ordinary zombie reinforcements. Disabling devils always selects the Tyrant. Below half health, the Tyrant performs two independently warned/aimed charges; the Lord's three-mark spell speeds up from eight to six seconds. Ordinary nonfatal hits do not interrupt Boss skills. Defeating all Bosses doubles each player's one chosen reward; surviving the time limit gives the normal reward.

Boss waves 5/10 contain one Boss, 15/20 contain two, and 25 onward contain at most three. Defeat all members to advance immediately with one doubled draft reward; a partial defeat followed by timeout earns the normal reward. Each Boss has one compact numeric-free overhead bar and counts under DEVIL. The clock fits inside WAVE. Bars use confirmed LAN health and hide on pause, offscreen or defeat.

Optional v2 extensions retain remaining time, choices, bonuses and Boss HP/skills. Old saves convert once, preserving score, equipment, current health/armor/ammo and crates while restarting the current wave timer and supplying the basic build without free refills. Later continues retain time/offers. LAN negotiates timed-waves-v1, wave-draft-v1, boss-waves-v1 and boss-encounters-v1 with dependencies; incompatible peers keep their prior rules and cannot load a newer-rule save.

Five gun models retain their exact gameplay muzzle/hand anchors. Ordinary/enchanted tracers, rockets and muzzle effects are clearer; variant/Boss armor follows the original body animation. Classic assets remain available for reference, and art adds no protocol fields.

<p align="center"><img src="../assets/readme/coop-crate.png" alt="Coop death weapon crate" width="640"></p>

- **Save & resume** — pause-menu **SAVE & QUIT**, main-menu **CONTINUE**; death **RETRY** restores the failed
  wave's starting checkpoint, or the run's starting state when no wave checkpoint exists yet, including its
  progression, score and inventory.
- **Coop death weapon crate** — a fallen player drops their whole arsenal with live ammo; pickup restores the
  owner exactly and gives the teammate the best of both.
- **Devil supplies** — every base devil drops one equally likely blue armor, olive ammunition or bright green medical
  crate. These crates stay across waves and saves until a living player can benefit. Armor fills only armor,
  medical fills only health, and ammunition fills all owned weapons without unlocking new ones. Full players
  leave the crate for later or for their teammate. Modern LAN peers negotiate these rules; older peers retain
  their supported rules.
- **Red boxes** — 10% armor, 10% ammunition, 10% medical effects, otherwise the original weighted pool of owned
  weapons without its old healing entry. A full or empty reward still consumes the box, with no reroll.
  Fixed boxes return after 24 seconds. Every 20 simulation seconds, 1 solo or 2 co-op boxes appear on reachable,
  empty floor, up to 3/6 active random boxes. These last 45 seconds; pausing stops the timer.
- **Start-wave input** — type an ASCII decimal number or use the arrows; the range is 1 through the historical
  `BEST` wave, extending beyond 100 with modern PvE. Leading zeros are normalized. Invalid text opens an in-game prompt and cancels
  starting or switching; Enter/blur commits, Escape restores the last valid value. Each visit starts at wave 1,
  and typing never unlocks waves. The LAN host edits against their own save cap; the guest sees a readonly value.
- **Personal PvE progression** — solo, local co-op and LAN share last-hit scores, permanent levels and weapon upgrades
  for each player. Zombies award 1 XP and devils 5 XP. New runs use basic level costs of 2–5 XP through level 10,
  6–15 XP through level 30, then 20 XP plus 3 per further level. Existing runs retain their saved curve.
  The original weapon unlock table remains at levels 1–125, with no modern PvE level cap. Top corner
  score/level/XP panels flank WAVE and its clock. Ordinary-wave counts include the unspawned objective;
  Bosses count under DEVIL. There are individual upgrade summaries while paused.
  Retry restores the current wave's starting growth and
  inventory; a fresh selected-wave run grants its baseline level from the same earned-wave curve, respecting
  the difficulty head start. Kill scores use the level before that kill's upgrade. Local co-op keeps its shared
  camera and controls; death match retains its rules. Old v2 local saves convert once while preserving total
  score, current health/armor, weapons and ammo; co-op splits old score equally, with any odd point going to P1.
- **Growing survivability** — new-run health and armor caps start at 200; levels 2–10 add 4 each,
  11–30 add 6, and 31 onward add 10, before run-upgrade bonuses. Existing saved curves retain
  `200 + 4 × (level − 1)`. A living level-up adds only the health-cap difference; armor does not refill. Enemy melee and
  fireballs do not interrupt or knock back a player who had armor before the hit, even if that hit breaks it.
  Damage still spills into health, and lethal hits still kill. Co-op respawn keeps level, fills health and
  clears armor; natural health regeneration is unchanged.
- **Endless weapon growth** — new runs add 1% weapon damage and 0.5% finite capacity per level at 11–30,
  then 2% and 1% per level from 31 onward. Existing saved curves retain their post-125 growth of 1% damage and
  `max(1, ceil(capacity at level 125 × 0.005))` finite ammo per level. Only the added capacity is supplied;
  inherited higher capacity remains valid. Saves restore current supplies without a bonus refill.
- **Four PvE difficulty curves** — Single and co-op retain Beginner, Intermediate, Expert and Nightmare pacing,
  active caps and speed ceilings. Modern timed waves replenish continuously; legacy finite-wave budgets stop at 200 zombies and 10 devils, including variants.
  Enemy health/damage continue scaling from the earned-wave reference level. LAN enables new rules after negotiation.
  See the [balance audit and explosion measurements](verification/v0.2.8/README.md).
- **Bone Charger and Ember Priest** — deterministic subtype slots start at waves 8/20, with at most four
  chargers and one priest active. The charger warns for 0.6 seconds, then rushes at most four cells along a
  locked direction; hits interrupt it. The priest replaces player fireballs with visible ground marks,
  warning for 0.9 seconds before four damage pulses. Walls block the flames and overlapping pulses do not stack.
- **Enchanted weapons** — chargers independently roll 50% for a red box, merged with the combo guarantee.
  Priests always drop one crate: 30% purple enchantment, otherwise equal armor/ammo/medical odds.
  Purple crates enchant the held weapon for +35% damage without adding ammo; bullets hit up to three enemies, railguns retain
  unlimited enemy piercing, and blasts retain at least 75% damage at the edge while physical walls block them.
  Red-box and Devil ammo refills, upgrades, switching, death crates, saves and rollback preserve the enchantment
  while the weapon still has ammo. The last round remains enchanted; later refills or replacements after depletion are ordinary.
  Surviving enchanted stock in older saves becomes a weapon enchantment without granting ammo. LAN requires both peers to support persistent-enchantment-v1.
  Authored infinite ammunition stays enchanted. Fake walls leave the crate available for an offensive weapon.
- **Reliable pickups and spacing** — supply effects synchronize personal maxima and preserve higher inherited
  capacities. Red single-weapon rewards fill only the selected weapon. P1/P2 notices use three evenly spaced
  confirmed HUD rows with smooth entry and fade; conditional lobby controls have separate action rows.
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
