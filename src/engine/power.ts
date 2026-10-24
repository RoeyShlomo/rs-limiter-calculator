/**
 * RS Limiter Calculator — power / voltage / impedance relations.
 *
 * Every power figure computed from a NOMINAL impedance is an EQUIVALENT value for
 * a resistive load of that value. Nominal impedance is not a constant physical
 * resistance, so these figures are never presented as true electrical power
 * delivered into a real loudspeaker.
 */

import { tracked, Tracked, derivedStatus, worstCertainty, ValueStatus, Certainty } from './status';

/** Vrms = sqrt(P * R) */
export function vrmsFromPower(powerW: number, impedanceOhm: number): number {
  return Math.sqrt(powerW * impedanceOhm);
}

/** P = Vrms^2 / R */
export function powerFromVrms(vrms: number, impedanceOhm: number): number {
  return (vrms * vrms) / impedanceOhm;
}

/** Current drawn by an equivalent resistive load: I = Vrms / R */
export function currentFromVrms(vrms: number, impedanceOhm: number): number {
  return vrms / impedanceOhm;
}

export interface PowerInput {
  powerW: number;
  impedanceOhm: number;
  powerStatus?: ValueStatus;
  impedanceStatus?: ValueStatus;
  powerCertainty?: Certainty;
  impedanceCertainty?: Certainty;
  /** e.g. "AES power", "Nominal impedance" */
  labels?: [string, string];
  /** true when the impedance used is nominal rather than a measured minimum. */
  impedanceIsNominal?: boolean;
}

export const NOMINAL_IMPEDANCE_NOTE =
  'Derived from nominal impedance. Nominal impedance is not a constant physical resistance: ' +
  'the figure is an equivalent value for a resistive load, not true electrical power into the ' +
  'loudspeaker, whose impedance varies with frequency.';

/** Tracked Vrms = sqrt(P * R), carrying provenance and the nominal-impedance caveat. */
export function trackedVrmsFromPower(input: PowerInput): Tracked {
  const { powerW, impedanceOhm } = input;
  const [pLabel, zLabel] = input.labels ?? ['Power', 'Impedance'];
  const notes: string[] = [];
  if (input.impedanceIsNominal !== false) notes.push(NOMINAL_IMPEDANCE_NOTE);
  return tracked(
    vrmsFromPower(powerW, impedanceOhm),
    'Vrms',
    'rms',
    derivedStatus(input.powerStatus, input.impedanceStatus),
    worstCertainty(input.powerCertainty, input.impedanceCertainty),
    {
      formula: `Vrms = sqrt(P * R) = sqrt(${powerW} W * ${impedanceOhm} ohm)`,
      sources: [pLabel, zLabel],
      notes,
    },
  );
}

/** Tracked equivalent power P = Vrms^2 / R. */
export function trackedEquivalentPower(
  vrms: number,
  impedanceOhm: number,
  opts: {
    voltageStatus?: ValueStatus;
    impedanceStatus?: ValueStatus;
    voltageCertainty?: Certainty;
    impedanceCertainty?: Certainty;
    labels?: [string, string];
  } = {},
): Tracked {
  const [vLabel, zLabel] = opts.labels ?? ['RMS voltage', 'Nominal impedance'];
  return tracked(
    powerFromVrms(vrms, impedanceOhm),
    'W',
    'power',
    derivedStatus(opts.voltageStatus, opts.impedanceStatus),
    worstCertainty(opts.voltageCertainty, opts.impedanceCertainty),
    {
      formula: `P = Vrms^2 / R = (${vrms.toFixed(4)} V)^2 / ${impedanceOhm} ohm`,
      sources: [vLabel, zLabel],
      notes: [NOMINAL_IMPEDANCE_NOTE, 'Shown as an EQUIVALENT power, not true electrical power.'],
    },
  );
}
