/**
 * RS Limiter Calculator — unit conversions.
 *
 * Internal base units: Vrms for RMS voltage, Vpeak for peak voltage, ohm, W, dB.
 * RMS and peak are separate domains and are NEVER converted implicitly: every
 * crossing between them requires an explicit crest factor supplied by the caller.
 */

/**
 * 0 dBu reference, per the RS Limiter Calculator specification: dBu = 20*log10(Vrms/0.775).
 * (The historical 600 ohm / 1 mW reference is 0.7745967 Vrms; the 0.775 rounding used here
 * differs by 0.0045 dB and is the value fixed by the project specification.)
 */
export const DBU_REF_VRMS = 0.775;
/** 0 dBV reference: 1 Vrms. */
export const DBV_REF_VRMS = 1;
/** Crest factor of a continuous sine wave: 20*log10(sqrt(2)) dB. */
export const SINE_CREST_FACTOR_DB = 20 * Math.log10(Math.SQRT2);

export function dbToRatio(db: number): number {
  return Math.pow(10, db / 20);
}

export function ratioToDb(ratio: number): number {
  if (!(ratio > 0)) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(ratio);
}

export function powerRatioToDb(ratio: number): number {
  if (!(ratio > 0)) return Number.NEGATIVE_INFINITY;
  return 10 * Math.log10(ratio);
}

// ---------------------------------------------------------------------------
// Voltage <-> level
// ---------------------------------------------------------------------------

export function vrmsToDbu(vrms: number): number {
  return ratioToDb(vrms / DBU_REF_VRMS);
}

export function dbuToVrms(dbu: number): number {
  return DBU_REF_VRMS * dbToRatio(dbu);
}

export function vrmsToDbv(vrms: number): number {
  return ratioToDb(vrms / DBV_REF_VRMS);
}

export function dbvToVrms(dbv: number): number {
  return DBV_REF_VRMS * dbToRatio(dbv);
}

export function dbuToDbv(dbu: number): number {
  return dbu + ratioToDb(DBU_REF_VRMS / DBV_REF_VRMS);
}

export function dbvToDbu(dbv: number): number {
  return dbv - ratioToDb(DBU_REF_VRMS / DBV_REF_VRMS);
}

// ---------------------------------------------------------------------------
// RMS <-> peak: explicit crest factor only
// ---------------------------------------------------------------------------

/**
 * Peak voltage of a waveform whose RMS voltage and crest factor are both known.
 * crestFactorDb = 20*log10(Vpeak/Vrms).
 */
export function vrmsToVpeak(vrms: number, crestFactorDb: number): number {
  return vrms * dbToRatio(crestFactorDb);
}

export function vpeakToVrms(vpeak: number, crestFactorDb: number): number {
  return vpeak / dbToRatio(crestFactorDb);
}

export function crestFactorDb(vpeak: number, vrms: number): number {
  return ratioToDb(vpeak / vrms);
}

// ---------------------------------------------------------------------------
// Waveform library (crest factors used for explicit domain crossings)
// ---------------------------------------------------------------------------

export interface Waveform {
  id: string;
  /** Crest factor in dB. */
  crestFactorDb: number;
  /** true when the figure is a defined mathematical property, not an estimate. */
  exact: boolean;
}

export const WAVEFORMS: Waveform[] = [
  { id: 'sine', crestFactorDb: SINE_CREST_FACTOR_DB, exact: true },
  { id: 'square', crestFactorDb: 0, exact: true },
  { id: 'triangle', crestFactorDb: 20 * Math.log10(Math.sqrt(3)), exact: true },
  { id: 'pink-noise', crestFactorDb: 12, exact: false },
  { id: 'white-noise', crestFactorDb: 12, exact: false },
  { id: 'aes2-noise', crestFactorDb: 6, exact: true },
  { id: 'program-dense', crestFactorDb: 8, exact: false },
  { id: 'program-dynamic', crestFactorDb: 15, exact: false },
];

export function waveform(id: string): Waveform | undefined {
  return WAVEFORMS.find((w) => w.id === id);
}

// ---------------------------------------------------------------------------
// Scale descriptors used by the UI
// ---------------------------------------------------------------------------

export type VoltageScale = 'Vrms' | 'Vpeak' | 'dBu' | 'dBV';

/** Convert an RMS voltage into any RMS-domain scale. Peak requires a crest factor. */
export function fromVrms(vrms: number, scale: VoltageScale, crestFactorDb?: number): number | null {
  switch (scale) {
    case 'Vrms':
      return vrms;
    case 'dBu':
      return vrmsToDbu(vrms);
    case 'dBV':
      return vrmsToDbv(vrms);
    case 'Vpeak':
      return crestFactorDb === undefined ? null : vrmsToVpeak(vrms, crestFactorDb);
  }
}

export function toVrms(value: number, scale: VoltageScale, crestFactorDb?: number): number | null {
  switch (scale) {
    case 'Vrms':
      return value;
    case 'dBu':
      return dbuToVrms(value);
    case 'dBV':
      return dbvToVrms(value);
    case 'Vpeak':
      return crestFactorDb === undefined ? null : vpeakToVrms(value, crestFactorDb);
  }
}

export function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}
