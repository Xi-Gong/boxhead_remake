# v0.3.0 verification

Development evidence is recorded per independent commit:

- [Reliable pickups, confirmed HUD messages and burst-entry correction](hud-messages.json)
- [Conditional menu layout and complete UI acceptance](menu-spacing.json)
- [Endless growth, bounded wave budgets and high-wave restore](endless-progress.json)
- [Enemy geometry, animation, skills, loot and enchanted ammunition](enemy-variants.json)
- [Integrated armor, horn geometry, native lighting and skill-effect polish](art-polish.json)
- [Complete native playback sequences and finite skill continuity](animation-continuity.json)
- [Real LAN input, shared-tick retry fixtures and owned-process cleanup](lan-fixture.json)

Visual review uses direct screenshots with pixel/geometry checks and real mouse/keyboard interactions.
The four viewports are 640×480, 960×720, 1280×720 and 640×889. Enemy contact sheets cover every original
direction/action, with an eight-second animation. Generated images and raw logs remain under
`generated/reports/v030/`; committed JSON records artifact identities and the scope of each result.

Final acceptance passed on asar `9075cf6d39a1cd5eda0da197ce61968216ba4092bbb8e03ab06155ac42bc9f05`:

- [42 functional release gates](gates.json), including UI 188/188 and audio 49/49.
- [Final acceptance](final-acceptance.json): 1572 Vitest tests passed; 71 preexisting conditional skips and four explicitly excluded explosive stress cases remain separate.
- [Actual portable EXE and extracted-runtime verification](artifact.json), including real save/continue and audio.
- [Local evidence archive and EXE checksums](archive.json).

The same packaged runtime is used across the recorded segments. Historical QA input, replay-fixture and
cleanup corrections retain their segment-start source hashes and original failed reports. Development records
above preserve their original pending-release status; the final acceptance and artifact records are authoritative.

Checks use isolated saves and short serial functional LAN runs. The working-hours constraint excludes the four
mixed explosive burst stress cases, allocation/CPU profiling and gameplay/LAN performance benchmarks. Existing
stress assertions remain available and are not reported as passing coverage. Small built-in renderer smoke timings
are retained without any comparative performance claim.

[Release notes](RELEASE_NOTES.md) · [Implementation record (Chinese)](../../../PARITY.md)
