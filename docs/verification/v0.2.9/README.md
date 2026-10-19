# v0.2.9 verification

This release unifies PvE progression, expands supplies, improves setup/input and fixes presentation/audio issues.
Death match and older negotiated LAN rules retain their established behavior. Implementation details and
individual validation records are in [PARITY §21](../../../PARITY.md).

**Acceptance scope agreed on 2026-10-19:** retain the initial candidate's completed functional and network
checks, verify the two subsequent runtime fixes with their targeted regressions, and perform a lightweight
final build/test/portable-launch check. The user explicitly selected this release scope because heavy QA
affected office work. The interrupted three-round performance comparison is **not complete** and is excluded
from release claims. Heavy QA remains disabled by default.

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

The initial candidate was checked through the existing typechecks, complete Vitest suite, browser UI/audio,
historical playtests, Electron/unpacked/packaged tests, old-save migration and the actual NSIS portable launcher.
Test windows are offscreen or created hidden, with isolated saves. The portable's extracted asar must match
the version and current built runtime bytes.

Response measurements start at the renderer input event and report simulation, first display, facing/camera,
and audio-node scheduling separately. They do not measure physical keyboard/device latency or imply zero
physical network latency. The matrix uses 0/30/60/100 ms injected **one-way** delay, reversed launch/sample order,
jitter, UDP suppression for real TCP fallback, renderer gaps and reconnect. Gameplay/events are compared at
the same confirmed tick. The ordinary limit is 60 ms; injected explosive stress permits occasional peaks up to 100 ms.

The original performance plan called for serial v0.2.8/candidate comparisons on the same machine, settings,
seed, input schedule and resolution: three alternating ordinary rounds and three 256-explosion/200-permanent-crate
rounds, each with a three-second warm-up and twenty-second sample. The first attempt exposed a 139 ms flash
regression. After its fix, a targeted two-peer run passed at 35/41 ms, but the renewed complete comparison was
interrupted at the user's request. Raw failed, diagnostic and partial data are retained; no three-round median,
overall speedup, allocation improvement or memory improvement is claimed. This release also does not claim
the separate historical v0.2.8 optimization experiment's relative speedups in `growth-compare.mjs`.
`collectionMs` is the elapsed forced collection and metrics round trip after sampling, including CDP overhead;
it is not a measurement of naturally occurring GC pauses. Both peers stop sampling before either collection.

## Matched local response

[network.json](network.json) records the same **initial** candidate asar in three offline local co-op runs and ten actual
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
Each record retains its own artifact identity. Initial-candidate evidence is not relabeled as a fresh full
run on the final artifact.

## Functional gate results

[gates.json](gates.json) records all 35 passing functional gates on initial candidate asar `d56222ff…`. Vitest passes
1,493 tests with 71 pre-existing conditional skips; none were added. Browser UI passes 188/188 and audio 49/49.
The three-mode browser, Electron and packaged playtests, historical regressions, actual LAN reconnect/timeout,
native/packaged smoke and actual v0.2.5 save continuity all pass. The old save retains score 1234, health 137,
Uzi ammunition 17, best wave 7 and its rebound fire key.

Each resumed segment records its starting source hash and log checksums. Three historical failures and their
corrections are retained: portrait pixels covered by the new HUD, an obsolete zero-input assumption, and the
old six-weapon selected-wave expectation. Production runtime bytes stayed identical throughout. Subsequent
packaged LAN QA uses dedicated ports 48630/48631–48640, installed only in owned test processes; this prevents
joining a player's normal room but does not remove CPU/GPU contention.

## Follow-up fixes and final checks

The only subsequent production changes are the LAN discovery-beacon lifetime/error handling in
`electron/lan.ts` and integer RGB flash offsets in `src/game/local/ExplosionFlash.ts`, with their deviation
records. The beacon changes pass six before-failing lifecycle regressions and twenty real transport tests.
The flash change passes 25 effect tests and six browser weapon scenes with exact pixel equality to the prior
softened output; the new path uses zero CPU filter calls instead of one. A real packaged two-peer diagnostic
with 256 explosions and 200 retained crates passes, with matching confirmed gameplay/events and no late waits.
That is a targeted diagnostic, not a completed three-round benchmark.

The final pass uses one Vitest worker, below-normal priority and at most two logical processors. Actual portable
launch uses a single hidden, non-focusable 640×480/DPR 1 instance with isolated saves. The artifact check compares
the complete extracted asar and each current runtime file, then exercises starting a game, saving, continuing
and audio startup. It does not rerun the full original browser/network matrix or claim hardware audio latency.

[final-acceptance.json](final-acceptance.json) records the agreed scope and passing final checks: all three
typechecks/build, 1,499 Vitest passes with the same 71 pre-existing conditional skips, a 491-module inventory
with all 117 mechanical ports unchanged, external portable packaging and the actual single-file smoke above.
[artifact.json](artifact.json) records final asar `0023e496…` and portable SHA256
`7ba5b3527d2524c7fc214947ce031fe30b37d780bfd7245079bf39674b15de26` (101,632,861 bytes).
The final screenshot was directly reviewed; the application and all test children exited after the check.
