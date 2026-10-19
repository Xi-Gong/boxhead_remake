# v0.3.0-rc2 — Keep your enchanted weapon supplied

## 💜 One focused gameplay change

- Purple crates now enchant the weapon you are holding. As long as it has not run out of ammunition, red-box ammo rewards and Devil ammunition crates refill it with enchanted rounds.
- Switching weapons, upgrades, recovery crates and save/continue retain the effect. The last round is still enchanted; refilling or reacquiring the weapon after depletion does not restore the enchantment.
- Surviving enchanted stock in older saves becomes a persistent weapon enchantment without adding ammunition. Drop rates, damage bonuses, piercing and explosion rules are unchanged.
- LAN negotiates the new optional rule. Peers without it retain the previous enchanted-stock behavior.

## Validation and release status

This is a **prerelease**. Validation passed **200 targeted tests**, all three TypeScript configurations, build, Chrome gameplay and the actual Windows portable at 640×480 with isolated saves. Checks were serial and used one game instance. Full release gates, two-instance LAN, performance benchmarks and stress testing were not run for rc2.

The previous release is now **v0.3.0-rc1**. Its original executable, filenames, hashes and evidence are unchanged; that binary still reports `0.3.0` internally. **v0.2.9** remains the latest stable release.

Windows portable: **Boxhead 2Play Rooms-0.3.0-rc2-portable.exe**. Saves remain in `%USERPROFILE%\.boxhead`.

[Detailed changes and verification (Chinese)](https://github.com/Xi-Gong/boxhead_remake/blob/v0.3.0-rc2/PARITY.md)

**Full changelog:** [v0.3.0-rc1...v0.3.0-rc2](https://github.com/Xi-Gong/boxhead_remake/compare/v0.3.0-rc1...v0.3.0-rc2)
