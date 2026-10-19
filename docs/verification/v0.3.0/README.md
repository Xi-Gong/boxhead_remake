# v0.3.0 verification

Development evidence is recorded per independent commit:

- [Reliable pickups, confirmed HUD messages and burst-entry correction](hud-messages.json)
- [Conditional menu layout and complete UI acceptance](menu-spacing.json)
- [Endless growth, bounded wave budgets and high-wave restore](endless-progress.json)
- [Enemy geometry, animation, skills, loot and enchanted ammunition](enemy-variants.json)
- [Integrated armor, horn geometry, native lighting and skill-effect polish](art-polish.json)
- [Complete native playback sequences and finite skill continuity](animation-continuity.json)

Visual review uses direct screenshots with pixel/geometry checks and real mouse/keyboard interactions.
The four viewports are 640×480, 960×720, 1280×720 and 640×889. Enemy contact sheets cover every original
direction/action, with an eight-second animation. Generated images and raw logs remain under
`generated/reports/v030/`; committed JSON records artifact identities and the scope of each result.

Final release acceptance is pending. It will use a fresh 0.3.0 build and matching packaged asar, isolated
saves and short serial functional LAN checks. The working-hours constraint excludes the four mixed
explosive burst stress cases, allocation/CPU profiling and performance benchmarks. Existing stress tests
remain available with their assertions; they are not reported as passing coverage. No performance gain is claimed.

[Release notes](RELEASE_NOTES.md) · [Implementation record (Chinese)](../../../PARITY.md)
