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

Status: implementation features pushed; real-input play and final release gates in progress. No tag or Release published yet.
