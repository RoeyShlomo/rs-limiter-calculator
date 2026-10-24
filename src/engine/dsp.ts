/**
 * RS Limiter Calculator — DSP level scales and dBFS conventions.
 *
 * 0 dBFS is never assumed to equal 0 dBu. A dBFS threshold is produced only when
 * BOTH the dBFS convention and the analog full-scale reference are established.
 */

import { DbfsConvention, DspDevice, ThresholdScale } from './types';
import { Tracked, tracked, unknown, MissingDatum, ValueStatus } from './status';
import {
  vrmsToDbu,
  dbuToVrms,
  vrmsToDbv,
  dbvToDbu,
  dbToRatio,
  ratioToDb,
  DBU_REF_VRMS,
  DBV_REF_VRMS,
  SINE_CREST_FACTOR_DB,
} from './units';

/**
 * Offset added to an RMS level measured relative to the RMS of a full-scale sine,
 * to obtain the device's own dBFS reading.
 *
 *  - AES17:            a full-scale sine reads 0 dBFS RMS       -> offset 0 dB
 *  - Peak-referenced:  a full-scale sine reads -3.01 dBFS RMS   -> offset -3.01 dB
 */
export function conventionOffsetDb(convention: DbfsConvention): number | null {
  switch (convention) {
    case 'aes17':
      return 0;
    case 'peak-referenced':
      return -SINE_CREST_FACTOR_DB;
    case 'unknown':
      return null;
  }
}

export const CONVENTION_LABELS: Record<DbfsConvention, string> = {
  aes17: 'AES17 (full-scale sine = 0 dBFS RMS)',
  'peak-referenced': 'Peak-referenced RMS (full-scale sine = -3.01 dBFS)',
  unknown: 'Unknown, calibration required',
};

export interface DspReference {
  /** RMS level in dBu of a full-scale sine at the DSP analog output. */
  analogFullScaleDbu: number | null;
  /** Provenance of that reference: a calculated threshold is only as good as this. */
  analogFullScaleStatus: ValueStatus;
  convention: DbfsConvention;
  offsetDb: number | null;
  /** True only when a dBFS threshold may be produced at all. */
  usable: boolean;
  missing: MissingDatum[];
}

export function dspReference(dsp: DspDevice | null): DspReference {
  const missing: MissingDatum[] = [];
  const convention = dsp?.dbfsConvention ?? 'unknown';
  const offsetDb = conventionOffsetDb(convention);
  const fs = dsp?.analogFullScaleDbu.value ?? null;

  if (convention === 'unknown') {
    missing.push({
      field: 'dBFS convention',
      blocks: ['thermal', 'peak', 'clip'],
      remedy: 'choose-convention',
      detail:
        'The device dBFS convention is unknown, so no threshold in dBFS can be calculated. Select ' +
        'AES17 or peak-referenced RMS from the manufacturer documentation, or establish it by measurement.',
    });
  }
  if (fs === null) {
    missing.push({
      field: 'Analog full-scale reference (dBu)',
      blocks: ['thermal', 'peak', 'clip'],
      remedy: 'field-calibration',
      detail:
        'The analog output level of a full-scale signal must be known before any dBFS threshold is ' +
        'meaningful. Measure the output voltage with a known full-scale test signal.',
    });
  }

  return {
    analogFullScaleDbu: fs,
    analogFullScaleStatus: dsp?.analogFullScaleDbu.status ?? 'unknown',
    convention,
    offsetDb,
    usable: offsetDb !== null && fs !== null,
    missing,
  };
}

/**
 * Threshold (dBFS) = Required DSP Output Level (dBu) - Analog Full-Scale Reference (dBu) + convention offset
 *
 * Returns an unknown Tracked when the reference is incomplete: no dBFS figure is
 * invented from an assumed 0 dBFS = 0 dBu equivalence.
 */
export function thresholdInDbfs(requiredDspOutputDbu: number, ref: DspReference): Tracked {
  if (!ref.usable || ref.offsetDb === null || ref.analogFullScaleDbu === null) {
    return unknown(
      'dBFS',
      'level',
      'No verified dBFS reference: the convention and the analog full-scale level must both be ' +
        'established before a dBFS threshold can be stated.',
    );
  }
  const value = requiredDspOutputDbu - ref.analogFullScaleDbu + ref.offsetDb;
  return tracked(value, 'dBFS', 'level', 'calculated', 'medium', {
    formula:
      `Threshold (dBFS) = Required DSP Output Level (dBu) - Analog Full-Scale Reference (dBu) + ` +
      `convention offset = ${requiredDspOutputDbu.toFixed(3)} - ${ref.analogFullScaleDbu.toFixed(3)} + ` +
      `${ref.offsetDb.toFixed(3)}`,
    sources: ['Required DSP output level', 'Analog full-scale reference', 'dBFS convention'],
    notes: [`Convention: ${CONVENTION_LABELS[ref.convention]}.`],
  });
}

/** Express a required DSP output RMS level (dBu) in whichever scale the DSP uses. */
export function expressThreshold(
  requiredDspOutputDbu: number,
  scale: ThresholdScale,
  ref: DspReference,
  opts: { relativeReferenceDbu?: number | null; crestFactorDb?: number | null; impedanceOhm?: number | null } = {},
): Tracked {
  switch (scale) {
    case 'dBu':
      return tracked(requiredDspOutputDbu, 'dBu', 'level', 'calculated', 'medium', {
        formula: 'Required DSP output level expressed directly in dBu.',
        sources: ['Required DSP output level'],
      });
    case 'dBV':
      return tracked(vrmsToDbv(dbuToVrms(requiredDspOutputDbu)), 'dBV', 'level', 'calculated', 'medium', {
        formula: `dBV = dBu + 20 * log10(0.775 / 1) = ${requiredDspOutputDbu.toFixed(3)} ${ratioToDb(
          DBU_REF_VRMS / DBV_REF_VRMS,
        ).toFixed(4)}`,
        sources: ['Required DSP output level'],
      });
    case 'Vrms':
      return tracked(dbuToVrms(requiredDspOutputDbu), 'Vrms', 'rms', 'calculated', 'medium', {
        formula: `Vrms = 0.775 * 10^(dBu / 20) = 0.775 * 10^(${requiredDspOutputDbu.toFixed(3)} / 20)`,
        sources: ['Required DSP output level'],
      });
    case 'Vpeak': {
      const cf = opts.crestFactorDb;
      if (cf === null || cf === undefined)
        return unknown(
          'Vpeak',
          'peak',
          'Expressing an RMS-domain threshold as a peak voltage requires an explicit crest factor.',
        );
      return tracked(dbuToVrms(requiredDspOutputDbu) * dbToRatio(cf), 'Vpeak', 'peak', 'calculated', 'low', {
        formula: `Vpeak = Vrms * 10^(crest factor / 20) = ${dbuToVrms(requiredDspOutputDbu).toFixed(4)} * 10^(${cf} / 20)`,
        sources: ['Required DSP output level', 'Declared crest factor'],
        notes: ['Explicit RMS -> peak crossing using the crest factor you declared.'],
      });
    }
    case 'dBFS':
      return thresholdInDbfs(requiredDspOutputDbu, ref);
    case 'dB-relative': {
      const r = opts.relativeReferenceDbu;
      if (r === null || r === undefined)
        return unknown(
          'dB',
          'level',
          'A dB-relative scale needs its reference level in dBu to be defined and verified.',
        );
      return tracked(requiredDspOutputDbu - r, 'dB', 'level', 'calculated', 'medium', {
        formula: `dB(relative) = Required DSP output (dBu) - Reference (dBu) = ${requiredDspOutputDbu.toFixed(3)} - ${r}`,
        sources: ['Required DSP output level', 'Defined reference level'],
      });
    }
    case 'W':
      // Power is an amplifier-output quantity. Deriving watts from a DSP output level
      // would describe power dissipated by the DSP into the loudspeaker load, which is
      // not a real circuit, so no number is produced here.
      return unknown(
        'W',
        'power',
        'A threshold in watts refers to power at the amplifier output into a stated load. It is not ' +
          'derived from the DSP output level. Use the equivalent power figure for the protection ' +
          'domain, and confirm which load the device assumes.',
      );
    case 'manufacturer-defined':
      return unknown(
        'dB',
        'level',
        'The manufacturer-specific scale has no defined meaning yet. Enter its relationship to dBu, ' +
          'dBFS or volts before a threshold can be stated in it.',
      );
  }
}

/** Convert a measured analog output level into the device dBFS reading. */
export function analogToDbfs(levelDbu: number, ref: DspReference): number | null {
  if (!ref.usable || ref.offsetDb === null || ref.analogFullScaleDbu === null) return null;
  return levelDbu - ref.analogFullScaleDbu + ref.offsetDb;
}

/** Convert a device dBFS reading into an analog output level in dBu. */
export function dbfsToAnalogDbu(dbfs: number, ref: DspReference): number | null {
  if (!ref.usable || ref.offsetDb === null || ref.analogFullScaleDbu === null) return null;
  return dbfs + ref.analogFullScaleDbu - ref.offsetDb;
}

export { vrmsToDbu, dbuToVrms, dbvToDbu };
