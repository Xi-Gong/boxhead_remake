# v0.3.8 verification

Final runtime **b488d9d4677d93d33346a36e98bdd1f4bc16119d** passed one clean default Vitest invocation: **2042 passed, zero failed, 71 existing conditional skips**. All **45 functional release gates** passed against the same asar, without reusing superseded-package results.

This release lowers enemy pressure, strengthens the shotgun and shield, adds a mandatory three-second result screen with an explicit reward multiplier, requires fresh entry and deliberate card selection/READY, and displays percentage-only attributes. Separate negotiated capabilities preserve older-peer behavior and optional v2 save compatibility.

## Artifact identity

Three typechecks, production build and external directory/portable packaging passed. Package, lockfile, extracted package and Windows PE versions are 0.3.8. All **70 non-map build files** match the package byte for byte.

| Item | Identity |
|---|---|
| Portable EXE | 101689625 bytes |
| EXE SHA256 | fb9fc79768902ca1b04e71d4a1409c2838dc5128e4cf9651537e7d275739747e |
| Entire asar SHA256 | 040d87b9c732c59a8eeb68ed40ef94b5cef891aef5658c99195491baf3f71721 |
| Renderer | dist/bundle/main-BIdt4GmZ.js |
| Runtime/build input fingerprint | 00d457fa1c7e8098bcb72a7b05a1dbfd21e749d4e797c56ba96c6a9d76933b99 (433 files) |

The fingerprint above records broad build-time inputs, including QA tools. The later release-coordinator change adds the retained supplemental checks; it changes that one broad input, while game/runtime source and all 70 packaged build files remain identical. Both identity records are retained. Publication, independent download/start and archive receipts are committed to main after release, without moving the annotated tag.

## Coverage

| Layer | Result and scope |
|---|---|
| Default complete Vitest | 2042 passed / 0 failed / 71 existing conditions, 2113 total; 179 files passed and two skipped. Includes 37 independent-process confirmed-state/event scenarios. |
| Existing conditions | 63 opt-in long-soak cases were not enabled; eight require removed original references. No new skips. The separate zero-test original-hotspots file remains. |
| Affected checks | Four difficulties × Single/Coop enemy ratios, attack cap and movement, actual shotgun emissions/near–mid–far hits, shield absorption and repeated saves; 108 transport/bridge assertions; gate save/rollback/command and input-lifetime checks. |
| Final functional gates | 45/45: the 33 main gates plus original draft input, bitmap/masked-copy comparisons, added UI, viewport pause, binding spacing, legacy Boss 1×/2×, functional engine checks, room-16 entrances, fourth-Boss lifecycle and 600-crate renderer restart/rejoin. Main coverage includes UI/audio, historical playtests, source/packaged Electron, native windows, old saves, actual portable and 30/60/100ms isolated LAN. |
| Original input regression | Real draft-input browser test passes on the final renderer, including held-A entry protection, selection and a 14-second no-default wait. |
| Static inventory | 665 modules; all 117 mechanical AS2 port files unchanged. |

Full summaries and raw locations are in [evidence.json](evidence.json). Release gates ran serially, muted and headless/hidden with isolated data and test-owned LAN ports. No performance benchmark or extra extreme-stress campaign was added. Source Electron smoke uses --skip-build to preserve frozen build inputs.

## Visual review

Direct screenshots plus pixel, geometry and real-click checks cover result/card/stat pages in Single and Coop at 640×480, 960×540 and 480×720. The reward multiplier is visible during and after the three-second wait. Nine local README captures and the actual packaged LAN percentage/partner-ready image were refreshed; prepared scenes keep normal-value builds and are not win-rate evidence. The visual receipt records the reviewed images; no zai method is claimed.

Proof images: [locked result](wave-clear.png), [no card selected](unselected-cards.png), [percentage-only co-op sheet](percent-stats.png).

Injected pads verify Xbox/Nintendo mappings rather than physical hardware. Same-machine LAN does not prove two-computer physical-network behavior. No general performance benefit or human difficulty/win-rate estimate is claimed.

## Retained attempts

The first complete run had 2033 passes and eight fixture failures. Explicit historical horde/READY fixtures and the complete modern entry flow resolved them while retaining assertions; the final clean invocation above supersedes this failed run. Earlier target-position and CR/LF setup corrections, release-filter investigations and sandbox localhost failures remain documented in PARITY section 31 and raw logs.

Candidate 1 was replaced after a real TCP test found a missing safe-entrances advertisement. Candidate 2 passed seven gates before direct review found the missing reward-multiplier label; its owned coordinator and active UI run were stopped and recorded as interrupted. Neither candidate supplies final-package passes. The final artifact above was freshly built and accepted from the start.

The final artifact's first candidate UI attempt failed solely because its pause-text fixture expected LF instead of Flash's CR normalization. The full-text expectation and equivalent pacing fixture were corrected, all original content/geometry/pixel/input assertions retained, and both complete scenarios passed. The coordinator then resumed on the same asar; the failed attempt remains recorded separately.

The source-only legacy Boss 1× fixture also had one initial navigation timeout before gameplay assertions. An unchanged rerun passed, followed by the 2× case. Both attempts remain recorded. The engine's optional benchmark is explicitly disabled in the functional runner; all 265 assertions and snapshots remain enabled.

English [release notes](release-notes.md), Chinese [PARITY history](../../../PARITY.md), and [machine-readable evidence](evidence.json). The [publication receipt on main](https://github.com/Xi-Gong/boxhead_remake/blob/main/docs/verification/v0.3.8/publication.json) and [archive receipt on main](https://github.com/Xi-Gong/boxhead_remake/blob/main/docs/verification/v0.3.8/archive-receipt.json) are populated after independent publication verification. Private profiles, caches and LAN addresses are excluded from public summaries.
