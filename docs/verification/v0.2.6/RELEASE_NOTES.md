# v0.2.6 — Polish, correctness & measured performance

A coordinated interface, a full code and gameplay audit, and reproducible performance improvements while preserving the existing game modes, saves, sound and input features.

## Interface

- Rework all main-menu entries with the original typography, shadows, spacing and reliable hit areas, preserving every entry and its order.
- Align START WAVE with OPTIONS / CONTROLS, place BEST below the value, and preserve unlock rules and popup avoidance.
- Put SAVE & QUIT beside QUIT in the pause header so the full upgrade list remains visible; repair paused-window resizing and deathmatch split-view placement.
- Organize LAN hosting, discovery and IP entry, player/readiness/resume actions and setup controls. Correct authored-mask clipping, label alignment and stale host status.
- Harmonize input badges and network messages, keeping them clear of the HUD and footer controls.

## Gameplay and lifecycle fixes

- Match cooperative display prediction to independent player movement.
- Allow desync cleanup while paused; consume both keyboard-layout press latches on every sample.
- Restore real pointer clicks on gamepad assignment controls.
- Reject stale LAN join/host/discovery results after leaving or starting another operation.
- Cancel pending binds, connects and handshakes on shutdown, limit incomplete handshakes, and release owned sockets and discovery timers.
- Bound long-session metadata/checksum bookkeeping and clear transient session state while retaining checkpoints and resume options.

## Code quality and performance

- Audit 413 source/tool/test modules and dynamic registrations. Remove confirmed dead builders, style tokens, imports and obsolete test bookkeeping; retain all original port classes and rollback facilities. All 117 files marked `Port of` remain unchanged.
- Share UI filter construction and enforce unused-variable/parameter checks in the engine/shared contracts and Node tools.
- Replace per-frame refresh-window cloning/sorting with an equivalent ordered window. Cache embedded-glyph coverage by immutable text layout and library identity, preserving invalidation and device-font fallback.
- In three alternating production baseline/candidate runs on the same machine, paused-scene frame-cost p95 medians improved **2.7 → 2.2ms (about 19%)**. Ordinary gameplay remained **1.7 → 1.7ms**, and the high-load fixture measured **1.8 → 1.7ms**. No stable regression was observed in the representative scenarios.
- Isolated warmed microbenchmarks measured **9.6×** for refresh-median maintenance and **18×** for glyph-coverage checks. These describe those paths, not whole-game FPS. LAN steady/reconnect measurements do not establish an overall LAN speedup.

## Validation and compatibility

- Three TypeScript checks; **1,266 Vitest passes**, with the existing 71 skips unchanged.
- Browser UI **188/188**, audio **28/28**, and **45** added-interface captures across four aspect ratios plus high DPI, with pixel/geometry and real-click checks.
- All existing gameplay/specialist playtests; all three modes in browser, development Electron and packaged Electron; native smoke **46/46** and packaged protocol checks **6/6**.
- Real UDP discovery and TCP connections, three paired steady-state and complete reconnect runs, coordinated retry, and **30/60/100ms one-way delay** gates. Deterministic world/checksum and ordered peer-sound regressions pass. Network hardware coverage here is same-machine dual instances; gamepad coverage uses simulated devices.
- The actual final portable launcher passes gameplay, save/continue and all 31 decoded sounds. A save produced by the released v0.2.5 app continues in v0.2.6 with room, score, health, ammo, progress and rebinding preserved.
- Save snapshot version and wire messages are unchanged. LAN retains its existing same-build identity requirement. Rollback coordination remains enabled with prediction depth 0; immediate display feedback does not remove simulation input delay.
- Shared Claude Code/Codex project habits now live in `AGENTS.md`, with the Claude entry point referencing it. Tests run in isolated saves and background windows.

Download the Windows x64 portable exe below. Saves remain in `%USERPROFILE%\.boxhead`.

**SHA256:** `e501c19a41f5e9010fa63c7675f1a998370ce56105980cb8dc7768e6083a0680`

[Audit and feature acceptance](https://github.com/Xi-Gong/boxhead_remake/blob/v0.2.6/AUDIT_v0.2.6.md) · [Raw measurements and methodology](https://github.com/Xi-Gong/boxhead_remake/tree/v0.2.6/docs/verification/v0.2.6) · [Incremental commits](https://github.com/Xi-Gong/boxhead_remake/blob/v0.2.6/docs/verification/v0.2.6/commits.md) · [Chinese change record](https://github.com/Xi-Gong/boxhead_remake/blob/v0.2.6/PARITY.md)

**Full changelog:** https://github.com/Xi-Gong/boxhead_remake/compare/v0.2.5...v0.2.6
