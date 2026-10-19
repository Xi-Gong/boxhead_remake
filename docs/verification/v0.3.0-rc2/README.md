# v0.3.0-rc2 targeted verification

This candidate changes only the lifetime of the held weapon's enchantment. It uses the explicitly authorized lightweight acceptance scope, not the complete release gate suite.

- [Acceptance and provenance](acceptance.json): 200 tests across 12 files, one worker, serial execution; all three TypeScript configurations and build passed.
- Three refill regressions failed before the change. Coverage includes red all-ammo rewards, red single-weapon rewards, Devil ammo crates, upgrades, switching, depletion, older saves, death crates, exact snapshot replay and capability negotiation. Both legacy and persistent enchantment rules retain damage/piercing/explosion assertions.
- Chrome and the actual portable EXE each ran a short, single-instance 640×480 scene with real mouse/keyboard input. A three-round enchantment survived a refill and additional shooting, retained 95 rounds through save/continue, then became ordinary after depletion and another refill. Purple HUD text passed pixel and geometry checks; both pairs of screenshots were directly reviewed without zai.
- The Chrome check preceded the metadata-only version bump; both builds emitted the same renderer bundle. The actual rc2 portable independently repeated the gameplay scenario, checked save/continue and 31 decoded sounds, and matched the entire staged asar plus current runtime files.
- [Portable identity](artifact.json) records the embedded `0.3.0-rc2` version and EXE/asar SHA256 values. Raw logs, screenshots and reproduction scripts are under `generated/reports/v030-rc2/` and the local evidence archive. Initial localhost sandbox failures remain recorded separately from passing functional checks.
- [Local archive receipt](archive.json) verifies the archived EXE and all 37 ZIP entries. This receipt stays outside the archive it hashes.

Full release gates, two-instance LAN, gameplay/LAN performance benchmarks and stress testing were **not run** for rc2. Simulation replay and capability tests do not claim live two-peer validation. No performance improvement is claimed. Tests used isolated saves and hidden windows; owned game and preview processes were cleaned up.

The previous release was redesignated [v0.3.0-rc1](https://github.com/Xi-Gong/boxhead_remake/releases/tag/v0.3.0-rc1). Its original assets and evidence are unchanged, and its embedded version remains `0.3.0`; see the [redesignation receipt](../v0.3.0-rc1/redesignation.json) and [original evidence](../v0.3.0/README.md). The latest stable release remains v0.2.9.
