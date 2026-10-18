export type WaveValidation = { ok: true; value: number } | { ok: false; reason: string };

/** Validate the complete draft, never a numeric prefix. Leading zeros are intentional. */
export function validateWaveText(raw: string, maximum: number): WaveValidation {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'Enter a wave number.' };
  if (!/^[0-9]+$/.test(text)) return { ok: false, reason: 'Use whole numbers with digits 0-9 only.' };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1 || value > Math.min(100, maximum))
    return { ok: false, reason: 'This wave is outside the unlocked range.' };
  return { ok: true, value };
}

/** Wire/start guard: only already-validated numeric integers belong on the network. */
export function validWaveNumber(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= Math.min(100, maximum);
}
