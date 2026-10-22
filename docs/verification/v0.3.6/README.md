# v0.3.6 release preparation

Status: **candidate preparation; not released**. Full serial functional and two-process LAN acceptance is awaiting explicit authorization required by AGENTS.md. An automatic approval review rejected the full suite on that basis; it has not run.

Implemented on main in independent, pushed commits:

- f40d06a: gentle early health ramp, larger finite hordes and Boss encounters, all finite base ammunition +25%, faster base shotgun.
- c8b3010: additive capped percentage builds, confirmed previews, deterministic dodge capped at 50%, old-save conversion.
- 25e72b0: early-clear double rewards, separate survival/Boss provenance and save/rollback deduplication.
- 7b5a8e5: restore exact legacy floating-point operation order; 14 targeted cases and three typechecks passed.

Targeted checks include 91 balance cases, 66 percentage/build cases and 35 clear-reward cases in separate overlapping suites. Do not add these counts into a claimed full-suite result. New percentage UI has six single/co-op and viewport cases with real menu, card, READY and keyboard input, geometry and pixel checks. Early-clear UI also has a separate real co-op selection check. Direct screenshot review is recorded; no zai or physical-controller claim.

A later exact-equality regression caught floating-point operation reordering in the legacy weapon branch introduced during this change. The initial external candidate is superseded. Its package and any prior checks must not be reused after correction.

Still required before publishing: final build/package identity, complete functional Vitest (retaining the four explicitly excluded extreme mixed-explosion cases), browser UI/audio and historical entry points, selectors and save/retry flows, native and packaged smoke, real isolated LAN at 30/60/100ms with recovery, actual portable launch, final screenshots, release upload and independent download verification.

## Corrected candidate artifact

Runtime source: b7da358. Renderer: `main-0rrdHfID.js`. Windows package, lockfile and PE versions are 0.3.6. Static inspection compared all 70 packaged build files byte for byte. The actual portable EXE launched once as a hidden, isolated 640×480 instance and passed gameplay entry, save/continue and 31-sample audio readiness. Its entire extracted asar matches the statically verified package; this is a basic smoke, not full acceptance or LAN evidence.

- Candidate: `release/v036-b7da358/Boxhead 2Play Rooms-0.3.6-portable.exe`
- Size: 101679663 bytes
- EXE SHA256: `08108709207096d102a72894e7bf93f36a0b7b5ff48cc01eb60240d7d30cb7a9`
- asar SHA256: `5882ca54b318d49f5fcf7d9382ba3cf1cb791f6d548b762338d48e91ed796316`
- A matching copy is stored in the separate local `v0.3.6-candidate-b7da358` archive folder.

The existing v0.3.5 release and tag were not replaced. No v0.3.6 tag or GitHub Release has been created. Pending browser/LAN gate adaptations and documentation/screenshot refreshes remain working changes until their acceptance is run. See [evidence.json](evidence.json) for scoped results; overlapping targeted totals are deliberately not combined.
