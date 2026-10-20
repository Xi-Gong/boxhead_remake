# v0.3.2 streamlined full release gates

Authorized directly by the user on 2026-10-20: “这里将轻量级验收改成按照完整的简化门禁验收然后发版”. This supersedes the earlier lightweight-only limit. Complete these checks, repair failures without weakening assertions, then publish the annotated v0.3.2 tag and English GitHub Release with the verified portable EXE.

| Gate | Required coverage |
|---|---|
| Source/simulation | Complete Vitest once after runtime settles; all three TypeScript configurations in the production build; 117 mechanical ports unchanged; old assertions remain in explicit classic fixtures. |
| Actual play/browser | Input-only real-time early Single, later Nightmare, Bosses and local Coop; repair unreasonable designs. Current UI/audio suites, actual keyboard/text/click input, draft stats/ready behavior and art/telegraph geometry/screenshots. |
| Actual LAN | One isolated hidden packaged pair at 640×480 and 30ms one-way delay: capability negotiation, common confirmed full digests, ordered sound/decal identities, new enemies/armor and Bosses, P2 navigation/stats, both ready/reward deduplication, actual transport recovery and natural-end/checkpoint retry. |
| Native/artifact | Fresh build before external packaging, complete asar/runtime/version equality; one hidden native protocol/input/fullscreen/persistence smoke and actual portable EXE launch with isolated saves, audio, save/continue and current draft/Boss gameplay. |

Reuse evidence only when relevant code/art bytes are unchanged. Runtime changes invalidate affected gates and packaged inputs; documentation-only changes do not require repacking identical bytes. Retain failed/interrupted evidence. Physical controllers are not implied by injected mappings. No performance improvement claim or rendered stress follows from these functional checks.

Historical version-specific browser/Electron scripts remain available. Their overlapping risks are covered by the current combined gates; record omitted scripts explicitly rather than claiming them executed. Do not run the full delay/performance matrix or foreground tests. Stop only owned coordinators/game/GPU processes and listeners.

All acceptance gates passed on the final renderer `main-DqmD-sRd.js` and verified v0.3.2 asar. Approved publication follows from the checked source commit.

| Result | Evidence under `generated/reports/v032/` |
|---|---|
| 1784 passed, 0 failed, 71 existing skips; three typechecks/build; 117 unchanged ports | `release-gates/vitest-final.json`; build and audit output |
| 188/188 UI, 54/54 audio | `release-gates/browser-ui-BtMFh9Vc/`, `release-gates/audio-final/`; the later entrance-only change has no UI/audio effects |
| Natural 90s early and Coop waves; natural 120s Nightmare Boss wave | `pacing/cover-fire-actual-*`, `pacing/coop-actual-*`, `pacing/nightmare-boss-actual-*`; real-time input-only scripts, raw defeats/limitations retained |
| Current fresh meshes, skills, shots, UI geometry/pixels/screenshots | Per-feature art reports linked in README; final portable and LAN images directly reviewed |
| Functional LAN complete; supplemental W/S and arrows up/down complete | `release-gates/lan/`, `release-gates/lan-final/`; both clean up their owned peers and guarded isolated ports |
| 70 packaged files identical; actual portable EXE and seven native groups pass | `release-gates/artifact.json`, `release-gates/portable/`, `release-gates/native/` |

Portable SHA256: `2b7763970c0ff026ef617baf8c55d27c5a4bc588ee41af0eeddd1c3e947e01ac`. The earlier preliminary package was invalidated by the entrance repair and is not the release artifact. Source and evidence were pushed feature by feature to `codex/feature-v0.3.1-gameplay-art`.
