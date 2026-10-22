# v0.3.5 release verification

Runtime source freeze: `8ef5502`. Package and lockfile root versions are **0.3.5**. Production renderer: `dist/bundle/main-DfsZwiT5.js`. Later changes concern verification, screenshots and documentation.

## Changes and compatibility

Printed Xbox/Nintendo letters now consistently drive B fire, A/Y shortcuts, X draft inspection and A menus/READY. Recognizable SN30 names select Nintendo automatically; a device/slot override covers generic Xbox IDs. Changing layouts waits for release. Blocked inspection consumes old press/release latches and discards the neutral release sample, preventing an accidental READY.

The independently negotiated `empty-weapon-feedback-v1` requires selectable empty weapons. A successful last finite emission returns to the pistol; empty guns stay selectable and give a tick-limited original alert. Failed placements stay held. Reselecting zero-stock remote charges still permits detonation. Existing snapshots and confirmed sound journaling handle replay without new clocks/RNG.

`enchant-power-v1` requires durability/persistent enchantment. Per-owner levels and choices raise only extra enchanted damage from 15% toward 45%, using `x=.01×(level−1)+.10×power picks` and multiplier `1+.15×(1+2x/(2+x))`. Existing emitted attacks keep their captured damage. New selected-wave builds share nine stats; old saved allocations are retained. Card previews, saves, replay and confirmed metadata cover single and doubled rewards. Explicit historical rules retain their semantics.

Native Boss strips are about **36×5.5**, at most three quarters of the authored player's HP height. Enchantment strips are **30×3.5**, no wider than HP and at most half its height. All highlights/shadows fit inside the geometry; original player health/armor positions remain. Shortcut letters use transformed text-layout edges; four real Canvas examples retain a 3-pixel visible gap.

## Acceptance

All **25 required functional gate groups** passed on the exact final asar: browser UI/audio, draft stats, candidate UI, native balance, browser/Electron/packaged play, historical v012/v019/v020/v023/v024/typing/LAN UI/retry/network entries, packaged LAN at 30/60/100 ms, Electron and packaged smoke, native controls, old-save migration and actual portable launch. The coordinator rejects mismatched renderer bytes; older fixed-name reports are copied per attempt before reuse.

Full serial Vitest: **1874 passed, 0 failed, 75 not executed / 1949 total**. The 75 not executed comprise 71 existing source/opt-in conditions and four explicitly excluded `mixed explosive burst` stress cases. No historical assertion was removed. Command: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 -t '^(?!.*mixed explosive burst)'`. All three typechecks and the full build passed. Static audit: **628 modules, 117 unchanged mechanical ports**.

Additional final-build checks cover printed-letter dropdown persistence and simulated positional buttons, empty-fire audio and fallback, scaled binding glyph pixels, and power cards/values in **640×480, 960×540 and 480×720**. Real mouse/keyboard clicks test card selection, READY, stats and the layout dropdown. The actual portable repeats the new empty-feedback, power-card and HUD flows, save/continue and decoded audio; its complete extracted asar equals the tested unpacked archive. A manual Nintendo override for an injected generic XInput identity also persisted across two real portable launches with the same isolated profile.

Packaged LAN compares gameplay/checksums and ordered sound/decal identities at common confirmed ticks. It covers reliable A/Y commands, last-shot fallback and empty alerts, rollback corrections, partial Boss defeat, real TCP rejoin, independent sheets, one-ready waiting, doubled power choices, death/retry and checkpoint restoration. Pair checks use dedicated 48630/48631–48640 ports with a main-process error guard and cleanup before final reports.

## Balance and pictures

Sixteen normal selected-wave comparisons (four difficulties, waves 5/15/25/100) use actual emissions and retain zombie HP/damage/speed. After the real Weapon.Update path settles upgrades and fires, complete-build enchanted UZI DPS rises about 3.7%–9.3% relative to the prior feature fixture. All 16 ordinary-zombie shot-count thresholds remain unchanged, including high-level one-shot kills already possible before this change. The earlier direct-Fire constructor-damage probe is retained as a fixture failure and excluded from balance evidence. The total enchant multiplier is bounded at 1.45 vs the initial 1.15 and still consumes finite durability. Enemy curves remain unchanged.

Twelve short native-Boss samples (four difficulties, waves 5/15/25) remove initial invincibility, pick up a real full armor crate, measure 1:1 damage/overflow with controlled fireball effects, then use actual move/fire keys with natural regeneration. Animation stays at most one frame per tick and projectile speed/range remain unchanged. These controlled/short input checks do not establish human win rates, complete clears or guaranteed survival.

All **nine** bilingual README images were freshly captured from the final production renderer or final packaged LAN build, using normal selected-wave progression and reachable values. They show combat strips/shortcuts, power/endurance cards, both local sheets, Nintendo layout, personal LAN stats with partner READY, native Bosses, recovery and supplies. Images link to their original PNGs and were reviewed at 640 pixels. Prepared positions, supplies and draft advancement illustrate features; they are not balance evidence.

Direct screenshot review is combined with pixel, geometry and real-click checks; zai was unavailable. Injected pads verify mappings, **not physical hardware**. No foreground game windows, player-save changes, background performance benchmark, extreme rendered stress or remote-machine test is claimed. Interrupted candidate/full-suite attempts and failed fixtures are retained separately as non-passing evidence. The extra persistence fixture initially failed to acquire the control through Tab traversal; explicit DOM focus followed by real End/Tab keys passed without foregrounding the window.

## Artifact and evidence

- EXE: `Boxhead 2Play Rooms-0.3.5-portable.exe`, **101679002 bytes**.
- EXE SHA256: `3dd3f2166e9cd2ae7883e50de84cf7f1f3ec548ac656c7d5b7bee8ca1b47b080`.
- Complete asar SHA256: `56c9e8d2b73192a4a274b90799066b5ec187cd1c1247a81cae15e4e95a26cd2c`.
- All **70 built files** match byte-for-byte; package, lock and embedded versions agree.
- External build: `C:/Users/royxg/boxhead-build/v035`; isolated stage: `release/v035`.
- Portable copied to ignored `release/` and `C:/Users/royxg/boxhead-exe-archive/`; binaries are not committed.
- **538 raw evidence files (32727429 bytes)** with a SHA256 manifest are archived at `C:/Users/royxg/boxhead-exe-archive/v0.3.5-verification`, excluding isolated profiles.

The compact [evidence ledger](evidence.json) binds the artifact, exact gate results, images and limitations. See the English [release notes](release-notes.md) and Chinese [PARITY](../../../PARITY.md). Publication/download verification is recorded separately after release.

The [formal v0.3.5 release](https://github.com/Xi-Gong/boxhead_remake/releases/tag/v0.3.5) was published at 2026-10-22T02:39:17Z from annotated tag `c7d8cec`. Both assets were independently downloaded: file sizes, SHA256, GitHub digest, PE/package versions and checksum contents match. The downloaded portable passed gameplay, save/continue, audio and the new controls/power/HUD scenario; its complete extracted asar matches acceptance. The [publication receipt](publication.json) and 19 separately archived publication evidence files record this final verification.
