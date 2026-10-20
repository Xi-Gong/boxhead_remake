# v0.3.2 implementation and verification

Approved on 2026-10-20. Work stays on `codex/feature-v0.3.1-gameplay-art`; each independent fix/feature is checked, committed and immediately pushed before the next completed item.

## Approved work

1. Fix P2 draft input, with keyboard, pad mapping and entry-held input regression coverage.
2. Negotiated unlimited drafts: no automatic choice; both participants explicitly ready before advancing.
3. Original light-grey/red UI, independent stats panels (P1 Tab / P2 R / gamepad Y), configurable keys, card previews and explicit ready actions.
4. Diminishing capacity/speed growth, finite special-weapon ammunition, per-weapon rate ceilings, 15% rocket self damage, shotgun damage/falloff; broader offense/defense/utility choices.
5. 40% of v0.3.1 zombie objectives/concurrency, authored entrances only, full-map reachability, map/path-dependent ordinary 75–105s and Boss +30s. Both may end by survival; no passive kill rewards.
6. Fast/flanking and bloated/melee zombies; random player-skin pistol/UZI/shotgun zombie; armored butcher and ranged hunter devils with Boss forms. Existing enemy HP increases and consumable devil/Boss armor.
7. Old saves finish their current combat under old rules and migrate at the next wave, preserving earned progress and clamping excess vitals/ammo without free refills. All new simulation fields persist through save/checkpoint/rollback and negotiated compatibility.
8. Actual input-driven single-instance play of early progression, later Nightmare, Bosses, local Coop and drafting. Fix unreasonable behavior, replay it and record evidence; do not describe state-injected fixtures as normal play.

## Authorization and release boundary

Only lightweight serial targeted checks and short single-instance low-resolution browser/game checks are currently authorized. No multi-instance live LAN, full release gate, rendered stress, performance benchmarks or foreground/focus stealing. The user selected this boundary explicitly. Obtain fresh full-gate authorization after presenting the concrete candidate; publish v0.3.2 and its portable EXE only after required gates pass. No new agents are authorized.

## Completed items

### Hidden gamepad draft click

`tests/sim/waveDraftInput.test.ts` first reproduced two virtual mouse events from held-A gameplay across draft entry, where no mouse events were expected. The virtual cursor now only operates outside an active unpaused world. Fire/confirm still uses each player's normal key slots. A client-role test covers both keyboard sets and swapped pad assignment without moving P1's choice.

Four targeted suites: 27 passing tests. Production build (all three TypeScript configurations) passed, renderer `main-D9jhRN5d.js`. First patch verification also exposed an incorrect main-state field and missing optional package guard; both were repaired before the passing checks. Browser attempts blocked by sandbox network access/timeouts are environment failures, not product passes. Real TCP peers and physical controllers have not been tested.

The narrow fix closes a verified accidental-confirmation path; it does not establish that every reported keyboard-navigation failure has the same cause. The unlimited-draft/explicit-ready work also removes the current 12-second lockout/default behavior.

Browser verification passed against the current production build: `generated/reports/v032/draft-input-1792502785409/report.json`. Real W/S and injected pad up/down navigated P2, held-A release did not mark ready, each player confirmed independently. Screenshot `p2-choice.png` directly reviewed at 640×480. This is local Coop UI plus a separate simulated LAN-client input test, not a live two-peer transport claim.

### Unlimited ready drafts

Optional `draft-ready-v1` requires the old timed/draft capabilities. Local new runs wait indefinitely; old LAN peers keep their original semantics. Saves preserve ready flags/offers, rollback awards once, unsupported worlds reject the new pending round before mutation. An old pending round converts without changing offers or already-ready players.

Six targeted suites passed 115 tests, then the added old-round migration test passed in the four-test readiness suite (116 distinct covered tests). Final build/typechecks passed: `main-CUTuAiny.js`. `generated/reports/v032/draft-input-1792503055472/report.json` records a real-input 14-second wait after P2 readiness, then P1 confirmation advancing. `ready-wait.png` directly reviewed. No live two-peer run.

### Draft cards and independent stat sheets

Light original-style cards now show benefit previews and separate mouse selection from explicit ready. Local sheets use actual derived stats; LAN sheets use confirmed tick metadata. Tab/R, pad Y, saved rebinding, conflict avoidance, selection retention and release protection are covered. Original CInput's retained listeners required a current-input identity guard; the failing first regression is retained in turn output. Stat capture distinguishes finite sentinel-sized magazines from authored infinite ammunition.

Related six suites cover 28 passing tests (final stats suite 5). All typechecks/build passed, renderer `main-DCu7_ZgT.js`. Real keyboard/mouse, injected pad mapping, pause/save/continue, two-player independence and geometry at 640×480 / 960×540 / 480×720 passed in `generated/reports/v032/draft-stats-1792503830015/report.json`; cards, P1 stats and portrait sheets directly reviewed. Initial failed browser run `draft-stats-1792503664664` exposed quoted key labels; review also corrected shadow layering before the final build. This fixture forces a wave end for UI coverage; it is not the requested ordinary combat play session, which remains pending until combat changes are implemented.
