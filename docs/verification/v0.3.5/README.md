# v0.3.5 compact weapon-name spacing

This small display revision supersedes the [previous HUD revision](previous-hud-README.md). Its complete functional baseline and publication receipt remain separately preserved; the same release URL is reused.

Runtime source: **6648700**. Renderer: **dist/bundle/main-aVVqC9Oi.js**. Package, lockfile, asar and PE remain **0.3.5**. Later commits contain QA/documentation and the publication receipt.

## Change

Without enchantment, weapon names return to the exact authored y=-65.9 position. With active durability they move down 3.6 logical pixels from the previous revision. Text-box-to-purple spacing is 0.5 pixels; purple-to-health spacing is 1 pixel. Binding/progress displays follow the same-frame position. Blue armor overlays, health/Boss/enchantment sizes and horizontal shortcut spacing are preserved. LAN continues to read confirmed durability. No simulation, protocol, save or mechanical port changes.

## Simplified acceptance requested by the user

- **7/7 focused HUD tests**: unchanged health/armor geometry, compact active spacing, original inactive position, weapon switches, depletion and repeated updates.
- Full build and its **three typechecks** pass.
- One headless Chrome game checks normal/enchanted/normal at **640×480, 960×540, 480×720**, with actual blue/purple pixels, geometry and real menu/pause input.
- The actual new portable EXE passes hidden startup, isolated save/continue, 31 decoded audio assets and the same focused spacing/pixel checks. Its full extracted asar matches the validated build; all **70 packaged files** match the fresh build byte-for-byte.
- Four affected combat README images were recaptured from the final production renderer and directly reviewed at 640-pixel width. Original PNG links remain. Menu, draft, stats and LAN images retain the previous accepted build; they show unchanged surfaces. Prepared scenes are illustrative, not balance evidence.

The full Vitest, LAN, balance, historical and standalone Electron/unpacked suites were **not rerun** for this spacing-only revision. Their prior baseline is linked above and is not represented as current execution. No stress or performance benchmarks ran. The first unit attempt exposed hold-progress overlap and was fixed by preserving wrapper order; an initial localhost service isolation failure was resolved without changing assertions. See the [evidence ledger](evidence.json).

The visual method is direct screenshot review plus actual Canvas pixels/geometry and real input; zai was unavailable. Runs are serial, hidden, low resolution and use isolated saves. Injected gamepads are not required for this change; no physical-controller claim is made.

## Artifacts

- EXE: **101677110 bytes**; SHA256 **a6f542b361e2f0b9593341378a701d7778e397f8d2f61a314e691c367a109eaa**.
- Complete asar SHA256: **10b01afaed4fd99197bc72a7a3dbc4786b0dcc64e3084d4e549e0bfe5ac16a08**.
- External build: C:/Users/royxg/boxhead-build/v035-name-spacing-20261022.
- Portable copies: ignored release/ and C:/Users/royxg/boxhead-exe-archive/. Previous f2663c2d… EXE retained in v0.3.5-hud-revision/. No binary is committed.
- Raw reports/screenshots/failure notes and SHA256 manifest: C:/Users/royxg/boxhead-exe-archive/v0.3.5-name-spacing-verification.

See [English release notes](release-notes.md), [PARITY](../../../PARITY.md), and the [publication receipt](publication.json). The updated assets are independently downloaded and launched before the final annotated tag moves to the latest receipt commit.

The replacement EXE and checksum attachment were independently downloaded from the formal Release. Size, SHA256, GitHub digest, PE/package version and the complete extracted asar match acceptance. The downloaded portable passes hidden startup, save/continue and audio. Its asar is identical to the candidate that passed the focused name-spacing checks; those checks were not unnecessarily repeated on the download. The annotated tag update follows this receipt commit.
