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
