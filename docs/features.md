[Back to README](../README.md)

## Beyond the original

### Timed waves, Bosses and run upgrades

Solo, local co-op and compatible LAN co-op loop indefinitely. Death match retains its rules.

Modern v0.3.2 rounds target **90 seconds normally and 120 seconds for Bosses**, adjusted to authored floor area and entrance paths: ordinary maps last 80–105 seconds; Bosses add 30 seconds. Menus show the exact limit. Pause, draft and disconnect freezes stop the simulation clock. Clear the finite ordinary objective or survive; defeating every Boss ends its round immediately. Timeouts grant no passive XP or kill rewards.

Zombie objectives and concurrency are **40% of v0.3.1**, with a maximum of 22 at HIGH and 16 at LOW. Enemies enter only through reachable original spawn points, never random ground near a player. Arrival windows alternate with recovery gaps. Family speeds differ; distant or wall-obscured approaches accelerate and slow for contact. Ordinary/charger HP is 2.5×, devil/priest/Boss HP 2×; devils have consumable armor worth 30% HP, Bosses 40%.

New models rebuild all visible body parts while retaining animation rigs and functional anchors. Runners flank from wave 3; heavy brutes warn before a close cleave from wave 6. From wave 8, gunners use one of four player-inspired identities and pistol/UZI/shotgun models; locked aim warnings precede slow, dodgeable projectiles. Armored butchers and fan-firing hunters join from waves 12/18, with Boss forms at 15/20. Boss families rotate charger, priest, butcher and hunter; disabling devils selects chargers. Encounters contain one Boss at 5/10, two at 15/20 and at most three from 25. Each has a compact overhead health/armor bar and counts under DEVIL.

Between waves, each player sees an offense, defense and utility card with current-to-next previews. **There is no countdown or automatic selection. Both players must confirm READY.** Movement or weapon keys navigate; fire confirms. Mouse clicks select a card, then READY confirms it. P1 **Tab**, P2 **R**, or gamepad **Y** opens an independent attribute sheet; its keyboard key can be rebound. Combat-entry held fire cannot confirm accidentally. LAN sheets show confirmed stats.

| Upgrade | One reward |
|---|---|
| Firepower / Vitality / Shield | +8% damage / +10% health / +10% armor bonus |
| Magazine | +8% capacity training, with diminishing returns |
| Haste / Mobility | +6% cadence / +4% movement training, with diminishing returns |
| Penetration / Supply | +12% armor penetration / +10% recovery training, with diminishing returns |
| First aid / Resupply | Restore 35% maximum health / owned finite ammo, improved by supply efficiency |

Rewards persist within the run, including saves and retries; new runs reset them. Useless/capped choices are excluded. Defeating all Bosses doubles one reward per player; survival earns the ordinary reward. Selected-wave builds distribute eight permanent attributes and derive earned XP without replaying prior waves or assuming Boss kills.

Finite ammo approaches at most 3× authored capacity; only the authored pistol stays infinite. Cadence has per-weapon ceilings. Shotgun pellets deal 65% damage and fall off with range; direct rocket self-blast damage is 15% before armor. Modern supplies replenish 40% of maximum, improved by bounded efficiency, instead of automatically filling everything. Existing natural regeneration and weapon unlocks remain.

Optional save/rollback fields preserve timers, offers, bonuses, new identities, armor and pending skills. Old saves finish their current combat under their prior rules and migrate at the next wave without free refills or lost earned progress. LAN negotiates combat-pve-v2 and draft-ready-v1 with all dependencies; older peers retain supported rules. Classic art and assertions remain available.

<p align="center"><img src="../assets/readme/coop-crate.png" alt="Coop death weapon crate" width="640"></p>

- **Save & resume** — pause-menu **SAVE & QUIT**, main-menu **CONTINUE**; death **RETRY** restores the failed
  wave's starting checkpoint, or the run's starting state when no wave checkpoint exists yet, including its
  progression, score and inventory.
- **Coop death weapon crate** — a fallen player drops their whole arsenal with live ammo; pickup restores the
  owner exactly and gives the teammate the best of both.
- **Devil supplies** — every base devil drops one equally likely blue armor, olive ammunition or bright green medical
  crate. These crates stay across waves and saves until a living player can benefit. Armor fills only armor,
  medical restores only health, and ammunition replenishes all owned weapons without unlocking new ones. Full players
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
  for each player. Ordinary zombies award 2 XP, chargers 4, devils 10, priests 12, and Bosses 50 (new Boss forms 70); new ordinary subtypes have individual rewards. New runs use basic level costs of 2–5 XP through level 10,
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
  modern capacity is bounded and obsolete excess is clamped at migration. Saves restore current supplies without a bonus refill.
- **Four PvE difficulty curves** — Single and co-op retain Beginner, Intermediate, Expert and Nightmare pacing,
  active caps and speed ceilings. Modern waves replenish within a finite reduced objective; legacy finite-wave budgets stop at 200 zombies and 10 devils, including variants.
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
  capacities within the modern cap. Red single-weapon rewards replenish only the selected weapon. P1/P2 notices use three evenly spaced
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
