# v0.2.7 LAN measurement evidence

These six alternating runs compare the retained legacy lockstep mode with rollback-v2 in the **same candidate executable**, identified by `machine.json`. They are not measurements of two separately published versions. Each run uses an isolated save directory, fixed initial random seed, the same room and input script, a 3-second warm-up and a 20-second sample. Both local processes inject 30 ms of outgoing delay into TCP and UDP (approximately 60 ms RTT). Windows remain offscreen and background throttling is disabled. The display runs at about 120 Hz; the canvas is 1624 × 1258 pixels. No concurrent CPU-heavy task ran during this comparison.

`1`–`3` JSON files preserve raw frame work times, presentation intervals, CDP CPU/heap/allocation samples, input probes and network observations. `summary.json` gives medians of the three runs per mode and role. Reproduce using `node tests/e2e/net-compare.mjs` after building and staging the matching unpacked app; use a new output directory when the build changes.

| Median | Legacy host / client | Rollback host / client |
|---|---|---|
| Key event to local input application | 110 / 94 ms | 16 / 33 ms |
| Presentation rate | 50.0 / 50.0 Hz | 120.4 / 120.4 Hz |
| Frame work p95 | 2.50 / 2.40 ms | 2.80 / 2.60 ms |
| Main-thread busy time | 9.0 / 9.0% | 22.7 / 21.7% |
| JS heap after forced GC | 27.4 / 27.5 MiB | 34.4 / 33.6 MiB |
| Estimated allocation rate | 3.1 / 3.1 MiB/s | 43.6 / 32.6 MiB/s |

The input probe observes the local input slot, so monster pushes cannot masquerade as an input response. Position response is retained as an auxiliary measurement. There are only three probes per role: these are medians, not tail-latency estimates. Frame work includes simulation, rollback, display preparation outside enterFrame, and canvas rendering. Heap allocation uses CDP sampling with a 32 KiB interval and includes instrumentation overhead; GC is forced only outside the measured window.

This is a steering workload with FIRE held, so the original semi-automatic pistol fires only a few times. It is not a dense-combat benchmark. Separate combat gates release and press FIRE repeatedly. Each modern comparison run also pauses at a common confirmed tick and compares complete gameplay checksums and ordered confirmed sound identities. No late-half input stalls occurred in these runs.

Rollback removes remote-input waiting from local control and permits display refresh above the simulation rate. It costs more CPU, allocation and memory. It cannot eliminate physical network transit time, guarantees no particular user's VPN quality, and does not make a 25 Hz simulation into a 120 Hz simulation. Independent-process fault tests cover jitter, delayed primary copies, duplicates and temporary outages; they are deterministic fault scheduling, not packet-loss measurements on a real VPN.
