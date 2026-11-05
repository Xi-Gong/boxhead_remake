# 🛡️ Boxhead v0.3.8 — Room to breathe

Less punishing enemies, a stronger shotgun and shield, and a deliberate break between combat and upgrades.

## 🎯 Lower enemy pressure

- Boss health is **40% lower** than v0.3.7.
- Ordinary fireball devils have **30% less health**, and ordinary zombies have **20% less health**.
- Zombie-family enemies, including zombie Bosses when devils are disabled, deal **15% less damage**, move **12% slower** and attack **15% slower**. Attack slowing remains effective at the existing high-wave speed cap.
- These reductions apply across Beginner, Intermediate, Expert and Nightmare, in solo and co-op. Boss health uses only its Boss reduction; enemy counts, spawn cadence, wave deadlines and difficulty differences remain.

## 🔫 A stronger shotgun and shield

- Shotgun base pellet damage is **15% higher**. Pellets at maximum range retain **55%** of near damage, up from 45%.
- The shotgun retains its 14-tick base period, spread, pellet count, range and ammo cost. Enchantment still scales an attack once and consumes one durability unit per volley.
- Base shield capacity rises from **40 to 60**, starting empty. Useful armor crates fill the shield; its existing percentage growth and limit of 40% of final health still apply.

## ⏸️ Read the result, then choose

- Every completed wave displays a separate result screen for **three full seconds**. Pressing keys or clicking cannot skip the wait or queue an early confirmation.
- Afterward, release old input and make a fresh fire-key / printed controller **A** press, or click **ENTER UPGRADES**. Co-op waits for both players.
- Upgrades start with **no card selected**. Navigate or click to choose a card, then make a separate confirmation. READY is unavailable until a card is chosen, and the entry press cannot confirm an upgrade.
- Upgrade selection has no timeout or automatic choice. Focus, pause, controller reconnect/layout changes and restored drafts require input release before a fresh confirmation.

## 📊 Percentage-only attributes

- All ten attribute rows show current percentage bonuses and caps, including the shield's final-health constraint.
- Raw health, shield, damage, shots-per-second, ammo and durability counts are removed from the attribute sheet. Level/XP, weapon identity and A/Y bindings remain.
- The pause summary also uses percentages. LAN sheets and summaries use confirmed values.

## Compatibility

Fixed an omitted safe-entrances capability advertisement so supported LAN peers actually negotiate the queued-enemy entrance guard. The new rules use separately negotiated optional capabilities. Older LAN peers retain their supported behavior. Existing Boss encounters preserve remaining health fraction, member progress and clocks when adopting the health adjustment once; current player supplies and earned progression are retained. Result-screen and upgrade progress persist through saves and rollback, without refills or repeated rewards.

[Change details and intentional deviations](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.8/PARITY.md)

**Full Changelog:** [v0.3.7...v0.3.8](https://github.com/Xi-Gong/boxhead_remake/compare/v0.3.7...v0.3.8)

