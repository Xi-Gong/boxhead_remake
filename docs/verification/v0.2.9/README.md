# v0.2.9 verification

This release unifies PvE progression, expands supplies, improves setup/input and fixes presentation/audio issues.
Death match and older negotiated LAN rules retain their established behavior. Implementation details and
individual validation records are in [PARITY §21](../../../PARITY.md).

**Current acceptance status:** the initial candidate completed the functional and network checks below.
Follow-up beacon-lifetime and GPU-flash fixes are committed and pass their targeted checks, including a real
two-process 256-explosion/200-crate run. The renewed full performance comparison was stopped at the user's
request because background QA affected office work. Its partial runs are not a completed comparison.
Heavy QA is disabled by default; final portable packaging and publication remain pending.

## Feature evidence

- [Confirmed score flights](floating-scores.json): four viewport sizes, owner geometry, pixels and replay identity.
- [Audio recovery](audio.json): constructor/resume/decode/node/clock fault injection and actual WebAudio output.
- [Room settings](room-settings.json): host edits, guest readonly state, real clicks and teammate pass-through regressions.
- [Wave input](wave-input.json): keyboard/paste/IME, complete ASCII validation, modal behavior and teardown.
- [Softer explosion flash](explosion-flash.json): real weapon paths, screenshots and measured brightness changes.
- [Local growth](local-growth.json): solo/co-op HUD, pause upgrades, score destinations and save/continue.
- [Growing survival](survival.json): scaled shield/health, all shield-fill states and real walk-over pickups.
- [Permanent supplies](supplies.json): three distinct crate finishes, native-size pixels, resize and save/pickup behavior.

Visual review uses direct screenshots plus pixel, geometry and real-click checks; no unavailable vision service
is claimed. CDP composition coverage is automated IME event coverage, not a claim of physical keyboard/IME testing.

## Release acceptance

The release candidate is checked through the existing typechecks, complete Vitest suite, browser UI/audio,
historical playtests, Electron/unpacked/packaged tests, old-save migration and the actual NSIS portable launcher.
Test windows are offscreen or created hidden, with isolated saves. The portable's extracted asar must match
the version and current built runtime bytes.

Response measurements start at the renderer input event and report simulation, first display, facing/camera,
and audio-node scheduling separately. They do not measure physical keyboard/device latency or imply zero
physical network latency. The matrix uses 0/30/60/100 ms injected **one-way** delay, reversed launch/sample order,
jitter, UDP suppression for real TCP fallback, renderer gaps and reconnect. Gameplay/events are compared at
the same confirmed tick. The ordinary limit is 60 ms; injected explosive stress permits occasional peaks up to 100 ms.

The v0.2.8 baseline and candidate are compared serially on the same machine, build settings, seed, input schedule
and resolution, with three alternating rounds for ordinary play and three for 256 mixed explosions plus 200
permanent supply crates. Each has a three-second warm-up and a twenty-second sample. Raw frame work, intervals,
allocation samples, memory before/after collection, resources and LAN cadence are retained. This functional
release reports measured costs and benefits; it does not presume the relative speedups required by the separate
historical v0.2.8 optimization experiment in `growth-compare.mjs`.
`collectionMs` is the elapsed forced collection and metrics round trip after sampling, including CDP overhead;
it is not a measurement of naturally occurring GC pauses. Both peers stop sampling before either collection.

## Matched local response

[network.json](network.json) records the same candidate asar in three offline local co-op runs and ten actual
two-process LAN cases. All use Room 18, the same seed, a 960×720 content area, DPR 1.5 and a 1440×1080 canvas.
Both launch and sampling order are reversed. Windows are transparent and non-focusable from creation; sizing
occurs after moving onto the primary display, avoiding far-offscreen DPI and one-pixel content-size differences.
At a deterministic simulation tick, the action fixture removes enemies and places protected players on open
central floor. This isolates identical movement/fire/switch actions from death, obstruction and camera clamping;
it is separate from the sustained combat and explosion workloads below. Display timing is render completion,
not detection of a physical screen pixel (the original protected-player blink still applies).

All movement, facing, shooting, weapon switching, camera and audio-node scheduling samples pass the 60 ms
ordinary limit. Offline's largest measured component is 38.3 ms. Across the ten LAN cases, the largest action
component is 41.9 ms; additional probes spanning the 40 ms simulation cycle peak at 42 ms. Switching is timed
from key release, its original action trigger. These are bounded samples on this machine, not an end-to-end
physical-device latency guarantee.

Each 0/30/60/100 ms one-way delay has host-first and client-first runs. The extra 30 ms case adds 0–20 ms jitter,
suppresses UDP input to force actual TCP fallback, stalls the host renderer for 200 ms, and disconnects/reconnects.
The extra 100 ms case adds jitter, stalls the client, and reconnects over the UDP-capable path. Both recover
their original worlds. All ten cases retain common-confirmed gameplay/event equality and zero waits in the
second half of their 20-second cadence windows. The deliberately injected 200 ms renderer gaps occur after
those windows and are explicitly recorded, not hidden inside the response statistics.

Early fixture failures are retained locally: Window-target diagnostics, a camera probe on a fully clamped small
map, DPI calibration, and an extra delayed UDP callback running after socket shutdown. The final matrix uses
the corrected fixtures and passes in full; no slower host path was introduced.

Raw logs/screenshots are retained under `generated/reports/v029/`; feature evidence above is committed.
Final gate, network, performance and artifact records are added after acceptance completes.

## Functional gate results

[gates.json](gates.json) records all 35 passing functional gates on the same candidate asar. Vitest passes
1,493 tests with 71 pre-existing conditional skips; none were added. Browser UI passes 188/188 and audio 49/49.
The three-mode browser, Electron and packaged playtests, historical regressions, actual LAN reconnect/timeout,
native/packaged smoke and actual v0.2.5 save continuity all pass. The old save retains score 1234, health 137,
Uzi ammunition 17, best wave 7 and its rebound fire key.

Each resumed segment records its starting source hash and log checksums. Three historical failures and their
corrections are retained: portrait pixels covered by the new HUD, an obsolete zero-input assumption, and the
old six-weapon selected-wave expectation. Production runtime bytes stayed identical throughout. Subsequent
packaged LAN QA uses dedicated ports 48630/48631–48640, installed only in owned test processes; this prevents
joining a player's normal room but does not remove CPU/GPU contention.
