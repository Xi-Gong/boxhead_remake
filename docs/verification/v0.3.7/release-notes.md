# 🛡️ Keep the run intact

## 🧟 Keep combat moving

- Fix adjacent opening zombies waiting forever for each other's entrance in room 16. They could occupy both enemy slots without becoming damageable, leaving the wave with no earned kills.
- Negotiate `safe-entrances-v1` independently. Reserve queued enemies' entrance corridors before initialization, using existing authored entrances and the original first-step rules. The unchanged 6,000-tick input cases now score 6,100 / 7,600 in Single / Coop, with normal combat values and the existing infinite-life test fixture; these are regression results, not win-rate estimates.
- Clear every owned Boss health bar before drawing current members. The fourth bar now disappears on death, leaving the camera or returning to a smaller encounter.
- Prevent a gamepad A held from combat from instantly locking an upgrade when the draft opens. Release it before confirming; a genuinely fresh press still works immediately. Xbox/Nintendo, Single/Coop and legacy input paths retain coverage.

## 🔧 LAN and recovery fixes

- Validate incoming LAN messages, settings, inputs and discovery ports before they reach gameplay. Check protocol/application identity in both handshake directions and disconnect malformed peers cleanly.
- Keep starting a match under host authority. Reject repeated handshake messages on an established connection.
- Bound remote input, command and checksum caches while a world is loading or frozen. A reproduction that previously retained 5,000 entries in each cache now retains none of those out-of-window entries.
- Transfer large long-run checkpoints through independently negotiated `large-frames-v1`. Both capable peers can reassemble checkpoints up to 8MiB; only checkpoints can exceed the original 64KiB frame limit, and forged oversized input/control transfers are rejected. Ordinary frames and legacy negotiation remain compatible.

Both peers need the new capabilities to enable entrance admission and large checkpoint transfer. Update both computers to v0.3.7; mixed older rooms retain their previous negotiated rules.

## 💾 Save protection

- Reject truncated saves, malformed nested data and player positions outside the selected map before restoring world state.
- Preserve the v2 save container, historical optional fields, earned progression, inventory and the original fallback for enemies saved before their first animation frame.
- Retain v0.3.6's gradual difficulty, percentage builds, dodge, early-clear rewards and existing input features.

## ✅ Verification

A clean invocation passed 2,068 tests with zero failures and eight existing conditional skips. Final-artifact checks include UI/audio, pad inputs, portable gameplay/save recovery, 30/100ms LAN and three matched worst-load baseline/candidate pairs. The verification record distinguishes current-artifact reruns from scoped historical coverage for unchanged code. Stress allocation and rare long frames remain documented optimization opportunities; this maintenance release makes no general FPS claim.

See the [verification record](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.7/docs/verification/v0.3.7/README.md) and [prioritized audit](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.7/docs/verification/v0.3.7/audit_zh_cn.md) for final test results, artifact identity, measured performance, retained failures and coverage limits. The audit includes all-map simulation and real-browser exploration, save/retry paths, hidden Electron/portable checks, real two-process LAN, and a 600-permanent-crate renderer-restart/rejoin regression. Controller injection verifies mappings; localhost peers do not establish physical-controller or two-computer network coverage.

[PARITY details](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.7/PARITY.md) · [Full changelog](https://github.com/Xi-Gong/boxhead_remake/compare/v0.3.6...v0.3.7)
