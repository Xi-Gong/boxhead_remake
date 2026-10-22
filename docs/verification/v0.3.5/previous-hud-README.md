# v0.3.5 revised HUD acceptance

This is the current v0.3.5 HUD revision requested after the initial release. It supersedes the [initial acceptance](initial-README.md) and [initial publication receipt](initial-publication.json); the previous EXE remains in the local v0.3.5-initial archive. The existing release URL is reused.

Runtime source freeze: **1b0359f**. Renderer: **dist/bundle/main-CjjAT_Bz.js**. Package, lockfile, asar and PE versions are **0.3.5**. Later changes concern documentation and publication evidence.

## Visible changes

- Restore blue armor over the original green health clip, retaining its authored masks and right-to-left fill animation. Full armor covers health, partial armor reveals it, and empty armor hides. LAN armor still reads confirmed values. Armor maxima, full crate refills, damage absorption and saves are unchanged.
- Native Boss bars remain short (**36 logical pixels**) and now match the authored player's HP height, normally **7.5**. Raised edges stay inside the strip. Historical Boss fixtures retain their original geometry.
- Weapon shortcut letters move out by another two logical pixels. Actual Canvas ink gaps are **5 / 5 / 4 / 5 pixels** for pistol, empty UZI, shotgun and the inherited large-magazine railgun fixture. Enchantment remains **30×3.5**, no wider than HP and at most half its height.

## Verification

All **25 required functional gate groups** passed against the exact new asar: browser UI/audio, draft stats, candidate UI, native balance, browser/Electron/packaged play, historical v012/v019/v020/v023/v024/typing/LAN UI/retry/network entries, delayed packaged LAN at 30/60/100 ms, Electron/packaged smoke, native controls, old-save migration and actual portable launch.

Across the complete serial Vitest run and the unchanged permitted-network rerun, **1874 tests passed, 0 remain failed, and 75 were not executed / 1949 total**. The raw sandbox run had 1865 passes, nine localhost failures and two EACCES errors; its two TCP/UDP suites then passed all 22 original assertions with networking permitted. The aggregate replaces those exact test identities rather than double-counting passes. Both raw reports remain archived; this is **not described as a single clean invocation**. The 75 not executed comprise 71 pre-existing source/opt-in conditions and four excluded mixed-explosion stress cases. No assertion was removed or skipped to conceal a failure.

All three typechecks, full build and static audit passed. The **117 mechanical ports remain unchanged**. The 12 armor stock/viewport combinations verify actual blue/green pixels and identical health/armor bounds at 640×480, 960×540 and 480×720; pause/resume and QUIT use real input. Final candidate/portable checks combine the restored overlay, endurance, power cards, A/Y bindings and the three native Boss health fractions. LAN gates compare complete gameplay and ordered confirmed sound/decal identities at shared confirmed ticks and retain actual reconnect/retry checks.

All **nine README images** were recaptured from the final renderer or final packaged LAN build and reviewed at a 640-pixel display width, with original PNG links retained. The combat gallery shows blue armor over green health, the compact purple strip, adjusted labels and equal-height Boss bars. Prepared positions, supplies and draft advancement illustrate features; they are not balance evidence.

The accepted method combines direct screenshot review, pixel/geometry assertions and real clicks; zai was unavailable. Injected pads validate mappings, **not physical hardware**. Checks are serial, hidden and low resolution with isolated saves/ports. No foreground game, performance benchmark, extreme rendered stress or remote-machine result is claimed. Fixture failures and the sandbox network errors are retained honestly. This revision does not change simulation, growth, inventory or protocol; the earlier bounded balance comparisons remain applicable.

## Artifacts

- EXE: **101678203 bytes**, SHA256 **f2663c2d1738db91906e674aac224f40f3342fb91e1d16bbf8d87acada49796c**.
- Complete asar SHA256: **957ed5f97f66757f9f3371a8eada40a2d13a3ce21f1173cd9a747d0627206b09**.
- All **70 built files** match byte-for-byte.
- External build: C:/Users/royxg/boxhead-build/v035-revision-20261022; isolated stage: release/v035-revision.
- Portable copies: ignored release/ and C:/Users/royxg/boxhead-exe-archive/. Binaries are not committed.
- **381 raw evidence files**, with a SHA256 manifest, archived at C:/Users/royxg/boxhead-exe-archive/v0.3.5-revision-verification; isolated profiles are excluded.

See the [evidence ledger](previous-hud-evidence.json), English [release notes](previous-hud-release-notes.md), Chinese [PARITY](../../../PARITY.md) and [publication receipt](previous-hud-publication.json). The revised attachments are independently downloaded and launched before the final annotated tag is moved to the latest receipt commit.

The revised EXE and checksum attachment were independently downloaded from the formal release. Size, SHA256, GitHub digest, PE/package versions and the complete extracted asar match acceptance. The downloaded EXE passed save/continue, audio and the controls/power/HUD scenario, including the restored armor overlay and 36×7.5 Boss bars. See the [updated publication receipt](previous-hud-publication.json). The final annotated tag update follows this receipt commit; the prior receipt remains available separately.
