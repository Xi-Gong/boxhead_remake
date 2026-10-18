# 分步提交记录

以下独立结果均验证后逐项提交并立即推送 main。最终版本/审计收尾提交由 v0.2.6 tag 定位。

| 提交 | 结果 |
| --- | --- |
| [12b6aa7](https://github.com/Xi-Gong/boxhead_remake/commit/12b6aa7) | docs: migrate shared project guidance and release habits to AGENTS.md |
| [33d28ff](https://github.com/Xi-Gong/boxhead_remake/commit/33d28ff) | fix(net): align display prediction with independent co-op movement |
| [f47c5b6](https://github.com/Xi-Gong/boxhead_remake/commit/f47c5b6) | test(net): accept either player keyboard map in input regression helpers |
| [979df4a](https://github.com/Xi-Gong/boxhead_remake/commit/979df4a) | fix(net): allow desync teardown while the game is paused |
| [572d2ac](https://github.com/Xi-Gong/boxhead_remake/commit/572d2ac) | fix(input): preserve real clicks on gamepad assignment controls |
| [5896773](https://github.com/Xi-Gong/boxhead_remake/commit/5896773) | fix(net): consume both keyboard-layout press latches every sample |
| [b8bd739](https://github.com/Xi-Gong/boxhead_remake/commit/b8bd739) | refactor: remove obsolete UI builder and add a dynamic-dependency audit inventory |
| [a2e9ffd](https://github.com/Xi-Gong/boxhead_remake/commit/a2e9ffd) | perf(loop): maintain the refresh median without per-frame sorting allocations |
| [60ebdb2](https://github.com/Xi-Gong/boxhead_remake/commit/60ebdb2) | fix(net): bound long-session bookkeeping and release transient state |
| [8cf4816](https://github.com/Xi-Gong/boxhead_remake/commit/8cf4816) | feat(ui): coordinate all main-menu entries with original typography and spacing |
| [82b2de7](https://github.com/Xi-Gong/boxhead_remake/commit/82b2de7) | feat(ui): align the start-wave toolbar with the original option controls |
| [14d53e6](https://github.com/Xi-Gong/boxhead_remake/commit/14d53e6) | fix(viewport): reconcile paused chrome and split views when resizing |
| [05041b4](https://github.com/Xi-Gong/boxhead_remake/commit/05041b4) | feat(ui): keep pause actions together above the full upgrade list |
| [50e5a25](https://github.com/Xi-Gong/boxhead_remake/commit/50e5a25) | feat(ui): coordinate LAN lobby and isolate setup controls from authored masks |
| [31af9cc](https://github.com/Xi-Gong/boxhead_remake/commit/31af9cc) | feat(ui): harmonize input badges and keep network status below the HUD |
| [4b6b643](https://github.com/Xi-Gong/boxhead_remake/commit/4b6b643) | test(electron): keep native window gates transparent and non-focusable |
| [5b1e7ba](https://github.com/Xi-Gong/boxhead_remake/commit/5b1e7ba) | refactor: consolidate UI filters and enforce unused-code checks in engine and tools |
| [218ba68](https://github.com/Xi-Gong/boxhead_remake/commit/218ba68) | fix(net): ignore stale lobby operations after leaving or starting a newer request |
| [a8e1d79](https://github.com/Xi-Gong/boxhead_remake/commit/a8e1d79) | fix(net): cancel pending binds and handshakes and release sockets on shutdown |
| [434ed2b](https://github.com/Xi-Gong/boxhead_remake/commit/434ed2b) | fix(ui): refresh host room status when a guest joins |
| [c180871](https://github.com/Xi-Gong/boxhead_remake/commit/c180871) | test(ui): cover added surfaces in four aspect ratios and high DPI |
| [529ba74](https://github.com/Xi-Gong/boxhead_remake/commit/529ba74) | test(ui): capture overridden high-DPI surfaces directly and verify PNG dimensions |
| [a29a396](https://github.com/Xi-Gong/boxhead_remake/commit/a29a396) | test(release): exercise the actual portable launcher through an isolated CDP endpoint |
| [0af7e6a](https://github.com/Xi-Gong/boxhead_remake/commit/0af7e6a) | perf(text): cache embedded glyph coverage by immutable layout and library |
| [50a694d](https://github.com/Xi-Gong/boxhead_remake/commit/50a694d) | refactor(tests): remove unused imports and obsolete rollback mock bookkeeping |
| [bbc8035](https://github.com/Xi-Gong/boxhead_remake/commit/bbc8035) | test(ui): fix stage-coordinate clicks and align legacy playtest targets |
| [b6ca61e](https://github.com/Xi-Gong/boxhead_remake/commit/b6ca61e) | test(net): verify real UDP discovery and room availability broadcasts |
| [a30199e](https://github.com/Xi-Gong/boxhead_remake/commit/a30199e) | test(net): retain the relaunched client handle for reliable cleanup |
| [f7d803a](https://github.com/Xi-Gong/boxhead_remake/commit/f7d803a) | test(perf): measure production and delayed LAN frame cost, CPU, heap and cache state |
| [17827e3](https://github.com/Xi-Gong/boxhead_remake/commit/17827e3) | docs: preserve verified control depths, cache rules and portable QA habits |
| [cbbc417](https://github.com/Xi-Gong/boxhead_remake/commit/cbbc417) | test(electron): keep all gameplay playtests invisible and use the current renderer build |
| [1c62069](https://github.com/Xi-Gong/boxhead_remake/commit/1c62069) | docs(perf): archive paired production measurements and reproducible hotspot results |
| [210762b](https://github.com/Xi-Gong/boxhead_remake/commit/210762b) | docs(perf): archive three paired real-LAN steady-state runs |
| [13bbd9a](https://github.com/Xi-Gong/boxhead_remake/commit/13bbd9a) | test(save): verify actual v0.2.5 progress and resume compatibility |
| [9db8248](https://github.com/Xi-Gong/boxhead_remake/commit/9db8248) | docs(qa): archive reconnect and delay evidence with accurate latency descriptions |
