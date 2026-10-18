# v0.2.8 acceptance evidence

## PvE balance

`balance.json` records all 100 waves at four difficulties, three kill-share growth models, actual upgraded weapon stats and 24 serial input-bot runs (Single/Coop × four difficulties × seeds 11/31/71). Reproduce with `node --experimental-transform-types tools/balance-audit.mjs`. The bots press normal keys and have no infinite life; their aim and tactics are imperfect. Their results are diagnostics, not human win-rate or enjoyment measurements.

Enemy health remains 100 for zombies and 1000 for devils, with original 50-damage attacks and original attack patterns. Each wave retains its original total kill budget. Profiles change pacing and active caps; LOW quality still caps zombies at 40. Devil concurrency never exceeds its wave budget. No player healing, regeneration or weapon damage formula is changed by balance tuning. Armor remains 100 and Devil loot remains an exclusive 20% armor / 20% ammunition / 60% original supply roll.

| Difficulty | Zombie / devil active ceiling | Minimum zombie spawn ticks at 25 Hz | Zombie / devil speed multiplier ceiling |
|---|---:|---:|---:|
| Beginner | 40 / 2 | 4 | 4.0 / 3.2 |
| Intermediate | 44 / 3 | 3 | 4.3 / 3.6 |
| Expert | 48 / 4 | 2 | 4.6 / 4.0 |
| Nightmare | 56 / 5 | 1 | 4.8 / 4.5 |

Spawn intervals shorten gradually and devil intervals shorten with difficulty. These ceilings are not immediate starting populations. Local Single/Coop retain original kill-multiplier growth. LAN personal growth uses `5 × (1 + floor((level − 1) / 10))` XP per level, capped at level 125. Zombies award 1 XP and devils 5 XP. Fresh selected-wave baselines model cleared previous waves with equal kill share, bank no score or XP, and preserve the difficulty head-start floor. Retry restores the saved checkpoint, including partial XP and armor.

| Wave start | 1 | 10 | 20 | 35 | 50 | 100 |
|---|---:|---:|---:|---:|---:|---:|
| Equal-share personal baseline | 1 | 22 | 46 | 84 | 122 | 125 |

In the discrete 50% kill-share model, the old five-XP rule caps during wave 19; the new curve caps during wave 50. At 30% / 70% share, the new cap points are wave 65 / 43. These are model outcomes, not promises of player performance. Disabling devils also removes their XP from the selected-wave model. Actual weapon stats retain tangible improvements: pistol body hits against a zombie fall from 4 at level 1 to 2 at level 8; UZI reaches one body hit at its late damage upgrade. This ignores misses, movement and obstructions.

New LAN rules require the negotiated `pve-balance-v1`, `personal-growth-v1` and `armor-ammo-v1` capabilities. Older peers retain the original wave/five-XP rules. Exact original curve assertions remain in explicit classic fixtures; separate tests check the new actual spawn caps, health, damage, optional save fields and all four independent-process correction/recovery paths.

## Visual checks

Headless installed Chrome uses real menu clicks, keyboard pickup movement, Canvas pixels and geometry at 640×480, 960×720, 1280×720 and 640×889. Screenshots are reviewed directly; zai is not used. The armor overlay retains the original life-bar outline and fill direction. Full armor covers health; partial armor exposes actual health, with checks at both 60% and 20%. The growth HUD also checks a 39/65 XP bar, MAX, large scores, enemy counters and both paused upgrade columns. Raw local screenshots/reports are under `generated/reports/v028/{supplies-ui,balance-ui,growth-ui}`.

## Release status

The final packaged performance comparison, sustained mixed-explosion runs and complete release gates must finish before publication. Earlier failed/cancelled measurements remain under `generated/reports/v028`; they are not counted as passing acceptance.
