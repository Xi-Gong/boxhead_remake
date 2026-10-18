# v0.2.6 verification data

Baseline: released v0.2.5 (7ce3aef). Candidate game code: 0af7e6a; later commits add QA and documentation. Both use production Vite output, headless installed Chrome, Intel ANGLE/D3D11, 1280×960 CSS, DPR1, BitmapData scale2, default GL filters and initial seed182026. Baseline/candidate runs alternate; no other tests or builds run during collection.

Reproduce with `GAME_URL=<production preview> PERF_OUT=<report.json> node tests/browser/run-perf-game.ts --release`. PowerShell users set the two environment variables before invoking Node. The real-game probe warms assets on boot, idles the menu, measures transitions, then runs ordinary gameplay, 60 explicit zombie spawns (with a one-second warmup), and a paused scene after a half-second warmup. The high-load fixture asserts all60 spawns succeeded; per-phase world state verifies simulation is advancing/frozen as intended.

`frameP50/P95` are instrumented Player enterFrame+render cost per rendered rAF, not refresh intervals or FPS. `taskMs/scriptMs` are CDP renderer CPU task totals for each phase. Heap samples and sampled allocations/GC include the identical measurement instrumentation; heap differences at a particular phase can reflect GC timing, and are not a retained-memory reduction claim. Cache/object/reference counts describe the live display tree. Every phase has zero attached disposed bitmaps.

The two microbenchmarks load the actual baseline/current functions and check equivalent behavior before timing three warmed runs. Their speedups apply only to the scheduler median and embedded-glyph coverage paths, respectively. They are not whole-game FPS multipliers.

The complete local logs/screenshots remain under `generated/reports/v026` and `generated/reports/qa`. Real LAN frame/CPU/heap samples are added after that matrix completes; hostnames and local network addresses are not needed in the archived numeric samples.
