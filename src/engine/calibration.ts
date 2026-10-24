/**
 * RS Limiter Calculator — field calibration mathematics and safety checks.
 *
 * The wizard measures the real voltage gain of the chain at a low, safe level and
 * extrapolates it. A value is marked 'measured' only when measurement data was
 * actually entered.
 */

import { Measurement, ThresholdScale, Amplifier } from './types';
import { Tracked, tracked, unknown, MissingDatum } from './status';
import { dbuToVrms, dbvToVrms, vrmsToDbu, ratioToDb, dbToRatio, SINE_CREST_FACTOR_DB } from './units';
import { DspReference, dbfsToAnalogDbu } from './dsp';

export interface TestSignal {
  id: string;
  crestFactorDb: number;
  /** Requires a true-RMS instrument to be measured correctly. */
  requiresTrueRms: boolean;
  /** Thermally stressful: must not be left running at high level. */
  thermallyHazardous: boolean;
  /** Suitable for deriving a gain figure. */
  goodForGain: boolean;
}

export const TEST_SIGNALS: TestSignal[] = [
  { id: 'sine-1k', crestFactorDb: SINE_CREST_FACTOR_DB, requiresTrueRms: false, thermallyHazardous: true, goodForGain: true },
  { id: 'sine-band', crestFactorDb: SINE_CREST_FACTOR_DB, requiresTrueRms: false, thermallyHazardous: true, goodForGain: true },
  { id: 'pink-noise', crestFactorDb: 12, requiresTrueRms: true, thermallyHazardous: true, goodForGain: true },
  { id: 'band-pink', crestFactorDb: 12, requiresTrueRms: true, thermallyHazardous: true, goodForGain: true },
  { id: 'aes2-noise', crestFactorDb: 6, requiresTrueRms: true, thermallyHazardous: true, goodForGain: true },
  { id: 'music', crestFactorDb: 15, requiresTrueRms: true, thermallyHazardous: false, goodForGain: false },
];

export function testSignal(id: string): TestSignal | undefined {
  return TEST_SIGNALS.find((s) => s.id === id);
}

export interface InstrumentCheck {
  ok: boolean;
  /** i18n keys of problems found. */
  issues: string[];
}

export function checkInstrument(m: Measurement, signalId: string): InstrumentCheck {
  const sig = testSignal(signalId);
  const issues: string[] = [];
  if (!sig) {
    issues.push('signalUnknown');
    return { ok: false, issues };
  }
  if (sig.requiresTrueRms && !m.instrumentTrueRms) issues.push('needsTrueRms');
  if (!sig.goodForGain) issues.push('signalNotForGain');
  if (m.measuredVpeak !== null && m.measuredVrms === null) issues.push('peakOnlyMeter');
  if (!m.instrument) issues.push('instrumentNotDocumented');
  return { ok: issues.length === 0, issues };
}

/** Safety warnings that must be shown before any measurement step. */
export function safetyWarnings(amp: Amplifier | null, targetVrms: number | null): string[] {
  const w: string[] = [
    'Amplifier outputs at performance level carry voltages that can injure or kill. Make every ' +
      'connection with the amplifier muted or powered down.',
  ];
  if (amp?.mode === 'bridge') {
    w.push(
      'BRIDGED OUTPUT: neither terminal is at ground potential. Measure differentially across the two ' +
        'output terminals only. Never connect a probe or a meter common to chassis ground.',
    );
  }
  if (targetVrms !== null && targetVrms > 100) {
    w.push(
      `The target output is ${targetVrms.toFixed(1)} Vrms. Use a meter rated for this voltage in the ` +
        'relevant category, with leads in good condition.',
    );
  }
  w.push(
    'Perform the calibration measurement at a LOW level first and extrapolate. Do not drive the system ' +
      'to its limit to find the limit.',
  );
  w.push(
    'An averaging (non true-RMS) meter reads noise and programme material incorrectly. Confirm the ' +
      'instrument suits the test signal before trusting the number.',
  );
  return w;
}

/** Convert a DSP output level expressed in any scale into dBu at the analog output. */
export function dspLevelToDbu(level: number, scale: ThresholdScale, ref: DspReference): number | null {
  switch (scale) {
    case 'dBu':
      return level;
    case 'dBV':
      return vrmsToDbu(dbvToVrms(level));
    case 'Vrms':
      return vrmsToDbu(level);
    case 'dBFS':
      return dbfsToAnalogDbu(level, ref);
    default:
      return null;
  }
}

export interface GainCalibration {
  /** Measured voltage gain of everything between the DSP output and the amplifier output. */
  gainDb: Tracked;
  /** The full-scale analog output level implied by the measurement, when measured in dBFS. */
  impliedFullScaleDbu: Tracked;
  missing: MissingDatum[];
  warnings: string[];
}

/**
 * Voltage Gain (dB) = 20 * log10(Vout measured / Vout of the DSP at the test level)
 *
 * Requires the DSP output level during the test to be expressible in dBu, which for
 * a dBFS test level means the analog full-scale reference must already be known.
 */
export function calibrateGain(m: Measurement, ref: DspReference): GainCalibration {
  const missing: MissingDatum[] = [];
  const warnings: string[] = [];

  if (m.measuredVrms === null || !(m.measuredVrms > 0)) {
    missing.push({
      field: 'Measured amplifier output voltage (Vrms)',
      blocks: ['thermal', 'peak', 'clip'],
      remedy: 'field-calibration',
      detail: 'Enter the voltage actually read at the amplifier output during the test.',
    });
  }
  if (m.dspOutputLevel === null) {
    missing.push({
      field: 'DSP output level during the measurement',
      blocks: ['thermal', 'peak', 'clip'],
      remedy: 'field-calibration',
      detail: 'The level sent out of the DSP during the test must be recorded.',
    });
  }

  const dspDbu =
    m.dspOutputLevel !== null ? dspLevelToDbu(m.dspOutputLevel, m.dspOutputScale, ref) : null;

  if (m.dspOutputLevel !== null && dspDbu === null) {
    missing.push({
      field: 'Analog full-scale reference (dBu)',
      blocks: ['thermal', 'peak', 'clip'],
      remedy: 'field-calibration',
      detail:
        'The test level was entered on a relative scale. Converting it to an analog level needs the ' +
        'analog full-scale reference and the dBFS convention.',
    });
  }

  if (m.measuredVrms !== null && m.measuredVrms > 0 && dspDbu !== null) {
    const voutMeasuredDbu = vrmsToDbu(m.measuredVrms);
    const gain = voutMeasuredDbu - dspDbu;
    if (m.loadOhm === null) {
      warnings.push(
        'The load impedance during the measurement was not recorded. Amplifier output voltage varies ' +
          'with load, so the derived gain is only valid for the load that was connected.',
      );
    }
    if (!m.instrumentTrueRms) {
      warnings.push(
        'The instrument was not marked as true RMS. Treat the derived gain as provisional.',
      );
    }
    return {
      gainDb: tracked(gain, 'dB', 'ratio', 'measured', m.instrumentTrueRms ? 'high' : 'low', {
        formula:
          `Voltage Gain (dB) = 20 * log10(Vout / Vin) = ${voutMeasuredDbu.toFixed(3)} dBu - ` +
          `${dspDbu.toFixed(3)} dBu`,
        sources: ['Measured amplifier output voltage', 'DSP output level during the test', 'Load impedance'],
        notes: [
          `Measured at ${m.measuredVrms.toFixed(3)} Vrms into ${m.loadOhm ?? 'an unrecorded'} ohm with ` +
            `${m.signal}. Valid only while the amplifier gain control stays where it was.`,
        ],
      }),
      impliedFullScaleDbu: impliedFullScale(m, gain, ref),
      missing,
      warnings,
    };
  }

  return {
    gainDb: unknown(
      'dB',
      'ratio',
      'Measurement incomplete: the gain cannot be derived yet.',
    ),
    impliedFullScaleDbu: unknown('dBu', 'level', 'Needs a complete measurement.'),
    missing,
    warnings,
  };
}

function impliedFullScale(m: Measurement, gainDb: number, ref: DspReference): Tracked {
  // When the test level was set in dBFS and the amplifier gain is now known, the
  // analog full-scale level follows from the measurement.
  if (m.dspOutputScale !== 'dBFS' || m.dspOutputLevel === null || ref.offsetDb === null) {
    return unknown(
      'dBu',
      'level',
      'The analog full-scale reference is derived only from a measurement made at a known dBFS level ' +
        'with a known dBFS convention.',
    );
  }
  if (m.measuredVrms === null) return unknown('dBu', 'level', 'Needs a measured output voltage.');
  const analogDbu = vrmsToDbu(m.measuredVrms) - gainDb;
  const fs = analogDbu - m.dspOutputLevel + ref.offsetDb;
  return tracked(fs, 'dBu', 'level', 'measured', 'high', {
    formula:
      `Analog full-scale (dBu) = analog level at test - test level (dBFS) + convention offset = ` +
      `${analogDbu.toFixed(3)} - ${m.dspOutputLevel} + ${ref.offsetDb.toFixed(3)}`,
    sources: ['Measured output voltage', 'Amplifier voltage gain', 'Test level in dBFS', 'dBFS convention'],
  });
}

/**
 * Establish the analog full-scale reference directly: send a signal at a known dBFS
 * level straight out of the DSP analog output and measure it, with no amplifier in
 * the path.
 */
export function calibrateDspOutput(
  measuredVrms: number,
  atDbfs: number,
  conventionOffsetDb: number | null,
): Tracked {
  if (conventionOffsetDb === null) {
    return unknown(
      'dBu',
      'level',
      'The dBFS convention must be selected before a measurement at a dBFS level can be interpreted.',
    );
  }
  const value = vrmsToDbu(measuredVrms) - atDbfs + conventionOffsetDb;
  return tracked(value, 'dBu', 'level', 'measured', 'high', {
    formula:
      `Analog Full-Scale Reference (dBu) = 20 * log10(Vrms / 0.775) - test level (dBFS) + convention ` +
      `offset = ${vrmsToDbu(measuredVrms).toFixed(3)} - ${atDbfs} + ${conventionOffsetDb.toFixed(3)}`,
    sources: ['Measured DSP analog output voltage', 'Test level in dBFS', 'dBFS convention'],
    notes: [
      'Measured with the DSP analog output unloaded or into a known high impedance, with no amplifier ' +
        'in the path.',
    ],
  });
}

/** Compare a planned value against a measured one. */
export interface Deviation {
  plannedValue: number | null;
  measuredValue: number | null;
  deltaDb: number | null;
  withinTolerance: boolean | null;
  toleranceDb: number;
}

export function deviation(planned: number | null, measured: number | null, toleranceDb = 0.5): Deviation {
  if (planned === null || measured === null || planned === 0) {
    return { plannedValue: planned, measuredValue: measured, deltaDb: null, withinTolerance: null, toleranceDb };
  }
  const deltaDb = ratioToDb(measured / planned);
  return {
    plannedValue: planned,
    measuredValue: measured,
    deltaDb,
    withinTolerance: Math.abs(deltaDb) <= toleranceDb,
    toleranceDb,
  };
}

/** Voltage expected at the amplifier output for a given DSP output level and gain. */
export function expectedOutputVrms(dspLevelDbu: number, gainDb: number): number {
  return dbuToVrms(dspLevelDbu + gainDb);
}

/** The safe low-level test point: the target, backed off by a chosen amount. */
export function safeTestLevel(targetVrms: number, backoffDb = 20): { vrms: number; dbu: number; backoffDb: number } {
  const v = targetVrms * dbToRatio(-Math.abs(backoffDb));
  return { vrms: v, dbu: vrmsToDbu(v), backoffDb: -Math.abs(backoffDb) };
}
