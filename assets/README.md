# Boxhead: 2Play Rooms — remake assets

This directory holds the reference material the remake needs. Everything else that used to live here
(the whole Boxhead series' SWFs, the Chinese-named mirror copies, all five games' ffdec decompiles,
the ClassicResources audio dumps, the Nightmare decrypter and four unused Flash projectors — about
107 MB) was removed in v0.2.0: the remake targets exactly one game, and the removed material is
re-derivable whenever needed (see below).

## What is here

| Path | Purpose |
|---|---|
| `boxhead_2play_rooms.swf` | The original 2007 SWF (sha256 `34ff145d…`, pinned in `tools/paths.ts`). The ultimate oracle: the extractor's only input, and the source for regenerating everything below. |
| `flash_player/FlashPlayer28.exe` | Reference renderer for the visual-diff goldens (`tools/oracle/visual/projector.ts`). |
| `flash_player/flashplayer_32_sa_debug.exe` | Debug projector the oracle probes drive (`tools/oracle/runProbe.ts`; needs `%USERPROFILE%\mm.cfg`). |
| `flash_player/FlashPlayer8.exe` | Oldest reference player (era-accurate cross-checks). |
| `readme/` | Screenshots used by the repo READMEs. |

The extracted game assets themselves (bitmaps/sounds/library.json/xsi.json) are **committed** at
`public/assets/` since v0.2.0 — a standard build never touches the SWF (`npm run extract` skips on a
valid manifest; it only needs this SWF when the extractor changes).

## Copyright

Boxhead is © Sean Cooper (seantcooper.com), sponsored by Crazy Monkey Games. This is a non-commercial
fan preservation / research project with no affiliation. The original resource collection this repo
started from was gathered by 造梦C君 (zmcj21/boxhead_res) — thank you.

## Regenerating the deleted reference material (optional)

Only needed to revive the FLA/AS2 cross-check tests (`tests/unit/swf/{media,text}.test.ts`,
`tests/unit/avm1/{registerClass,hotspots}.test.ts`) or `tools/gen-packages.ts`. Re-extracting the
game assets never needs this — that uses the SWF alone.

```shell
# 1) get ffdec (JPEXS Free Flash Decompiler): https://github.com/jindrapetrik/jpexs-decompiler
# 2) export the FLA + decompiled ActionScript from the SWF:
java -jar ffdec.jar -export fla,script assets/projects/boxhead4 assets/boxhead_2play_rooms.swf
# 3) paths.ts expects the FLA at assets/projects/boxhead4/boxhead2play.fla (ffdec names it after
#    the SWF, so rename boxhead_2play_rooms.fla -> boxhead2play.fla; the .as sources land under
#    assets/projects/boxhead4/scripts/ - move them up to match the old layout, if you need
#    gen-packages/hotspots tooling)
```

(Command syntax per ffdec's documented CLI; check `java -jar ffdec.jar -help` for your version.)
