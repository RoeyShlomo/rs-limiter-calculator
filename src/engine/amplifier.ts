/**
 * RS Limiter Calculator — amplifier voltage gain and limits.
 *
 * Amplifier output level and DSP output level are never treated as identical:
 * everything here is expressed at the amplifier terminals, and the DSP side is
 * only reached by subtracting the amplifier voltage gain.
 */

import { Amplifier, AmpMode, SensitivityUnit } from './types';
import { Tracked, tracked, unknown, isKnown, MissingDatum } from './status';
import { vrmsFromPower } from './power';
import { dbuToVrms, dbvToVrms, ratioToDb, vrmsToDbu, dbToRatio, SINE_CREST_FACTOR_DB } from './units';

/** Bridge mode doubles the output voltage swing: +20*log10(2) dB. */
export const BRIDGE_GAIN_DB = 20 * Math.log10(2);

export function sensitivityToVrms(value: number, unit: SensitivityUnit): number {
  switch (unit) {
    case 'Vrms':
      return value;
    case 'dBu':
      return dbuToVrms(value);
    case 'dBV':
      return dbvToVrms(value);
  }
}

/** Voltage Gain (dB) = 20 * log10(Vout / Vin) */
export function voltageGainDb(voutRms: number, vinRms: number): number {
  return ratioToDb(voutRms / vinRms);
}

/** Inverse: the input voltage that drives the amplifier to a given output voltage. */
export function inputVrmsForOutput(voutRms: number, gainDb: number): number {
  return voutRms / dbToRatio(gainDb);
}

export function ratingForLoad(amp: Amplifier, loadOhm: number): { powerW: number; impedanceOhm: number } | null {
  if (!amp.ratings.length) return null;
  const exact = amp.ratings.find((r) => Math.abs(r.impedanceOhm - loadOhm) < 0.01);
  if (exact) return exact;
  // Fall back to the nearest published load, flagged by the caller.
  let best = amp.ratings[0];
  for (const r of amp.ratings) {
    if (Math.abs(r.impedanceOhm - loadOhm) < Math.abs(best.impedanceOhm - loadOhm)) best = r;
  }
  return best;
}

export interface AmplifierAnalysis {
  /** Voltage gain of the channel in its configured mode. */
  gainDb: Tracked;
  /** Maximum RMS output voltage into the actual load. */
  maxOutputVrms: Tracked;
  /** Maximum peak output voltage, when determinable. */
  maxOutputVpeak: Tracked;
  /** Maximum input level before the amplifier itself clips, in dBu. */
  maxSafeInputDbu: Tracked;
  /** Mode notes, load warnings, safety warnings. */
  warnings: string[];
  missing: MissingDatum[];
}

function modeGainDb(mode: AmpMode): number {
  // Bridge: both halves drive the load in antiphase -> twice the voltage.
  // Parallel: twice the current capability, same voltage swing.
  return mode === 'bridge' ? BRIDGE_GAIN_DB : 0;
}

/** Load seen by each amplifier half in bridge mode. */
export function effectiveLoadPerDevice(loadOhm: number, mode: AmpMode): number {
  if (mode === 'bridge') return loadOhm / 2;
  if (mode === 'parallel') return loadOhm * 2;
  return loadOhm;
}

export function analyzeAmplifier(amp: Amplifier, loadOhm: number | null): AmplifierAnalysis {
  const warnings: string[] = [];
  const missing: MissingDatum[] = [];
  const addedGain = modeGainDb(amp.mode);

  if (amp.mode === 'bridge') {
    warnings.push(
      'BRIDGE MODE: output voltage is doubled (+6.02 dB) and NEITHER output terminal is at ground. ' +
        'Never reference a meter probe to chassis ground on a bridged output. Each amplifier half sees ' +
        'half the nominal load impedance.',
    );
  }
  if (amp.mode === 'parallel') {
    warnings.push(
      'PARALLEL MODE: voltage gain is unchanged; current capability is doubled. Confirm the ' +
        'manufacturer minimum load for parallel operation.',
    );
  }
  if (amp.internalLimiter === 'active') {
    warnings.push(
      'An internal amplifier limiter is active. It will alter the measured output during calibration ' +
        'and makes the DSP threshold derivation ambiguous. Document or bypass it.',
    );
  } else if (amp.internalLimiter === 'unknown') {
    warnings.push('Internal amplifier limiter status is unknown. Verify before trusting a calibration.');
  }

  // ----- Maximum output voltage -----
  let maxRms: Tracked;
  const sensLoad = amp.sensitivityLoadOhm.value;
  const rating = loadOhm !== null ? ratingForLoad(amp, loadOhm) : null;

  if (amp.maxOutputVoltage.value && amp.maxOutputVoltage.value > 0) {
    const v = amp.maxOutputVoltage.value;
    if (amp.maxOutputVoltageIsPeak) {
      maxRms = unknown(
        'Vrms',
        'rms',
        'Published maximum output voltage is a PEAK figure. Converting it to RMS requires an explicit ' +
          'crest factor, which is not assumed here.',
      );
    } else {
      maxRms = tracked(v * dbToRatio(addedGain), 'Vrms', 'rms', amp.maxOutputVoltage.status, 'high', {
        formula:
          addedGain === 0
            ? 'Published maximum RMS output voltage.'
            : `Published maximum RMS output voltage * bridge factor: ${v} V * 2`,
        sources: ['Maximum output voltage', 'Amplifier mode'],
      });
    }
  } else if (rating) {
    const v = vrmsFromPower(rating.powerW, rating.impedanceOhm) * dbToRatio(addedGain);
    const mismatch = loadOhm !== null && Math.abs(rating.impedanceOhm - loadOhm) > 0.01;
    maxRms = tracked(v, 'Vrms', 'rms', 'calculated', mismatch ? 'low' : 'medium', {
      formula: `Vrms(max) = sqrt(P * R) = sqrt(${rating.powerW} W * ${rating.impedanceOhm} ohm)${
        addedGain ? ' * 2 (bridge)' : ''
      }`,
      sources: ['Rated power per channel', 'Rated load impedance', 'Amplifier mode'],
      notes: [
        'Maximum output voltage derived from a rated power figure into a nominal load. Rated power is ' +
          'measured under defined conditions (mains voltage, duration, distortion) that live programme ' +
          'material does not reproduce.',
        ...(mismatch
          ? [
              `No published rating at ${loadOhm} ohm; the ${rating.impedanceOhm} ohm rating was used. The ` +
                'real maximum voltage into this load will differ.',
            ]
          : []),
      ],
    });
    if (mismatch)
      warnings.push(
        `Amplifier has no published power rating at the actual load of ${loadOhm} ohm. Treat the ` +
          'maximum output voltage as an estimate.',
      );
  } else {
    maxRms = unknown(
      'Vrms',
      'rms',
      'No published maximum output voltage and no usable power rating for this load.',
    );
    missing.push({
      field: 'Maximum output voltage, or rated power at a stated load',
      blocks: ['clip'],
      remedy: 'enter-specification',
      detail: 'The amplifier clipping limit cannot be established without one of these.',
    });
  }

  // ----- Voltage gain -----
  let gain: Tracked;
  if (amp.voltageGainDb.value !== null && Number.isFinite(amp.voltageGainDb.value)) {
    gain = tracked(amp.voltageGainDb.value + addedGain, 'dB', 'ratio', amp.voltageGainDb.status, 'high', {
      formula:
        addedGain === 0
          ? 'Published voltage gain.'
          : `Published voltage gain + bridge factor: ${amp.voltageGainDb.value} dB + ${BRIDGE_GAIN_DB.toFixed(2)} dB`,
      sources: ['Voltage gain', 'Amplifier mode'],
    });
  } else if (amp.inputSensitivity.value && amp.inputSensitivity.value !== 0 && sensLoad) {
    const sensRating = ratingForLoad(amp, sensLoad);
    if (sensRating) {
      const vin = sensitivityToVrms(amp.inputSensitivity.value, amp.sensitivityUnit);
      const voutRated = vrmsFromPower(sensRating.powerW, sensRating.impedanceOhm);
      gain = tracked(voltageGainDb(voutRated, vin) + addedGain, 'dB', 'ratio', 'calculated', 'medium', {
        formula:
          `Voltage Gain (dB) = 20 * log10(Vout / Vin) = 20 * log10(sqrt(${sensRating.powerW} W * ` +
          `${sensRating.impedanceOhm} ohm) / ${vin.toFixed(4)} Vrms)${addedGain ? ' + 6.02 dB (bridge)' : ''}`,
        sources: ['Input sensitivity', 'Rated power at the sensitivity load', 'Amplifier mode'],
        notes: [
          'Gain derived from input sensitivity for rated output. Valid only if the gain control was in ' +
            'the same position as the published sensitivity figure assumes.',
        ],
      });
    } else {
      gain = unknown('dB', 'ratio', 'No rated power at the load the input sensitivity refers to.');
    }
  } else {
    gain = unknown(
      'dB',
      'ratio',
      'Neither a published voltage gain nor an input sensitivity with a matching rated power / load.',
    );
    missing.push({
      field: 'Voltage gain (dB), or input sensitivity with rated power and load',
      blocks: ['thermal', 'peak', 'clip'],
      remedy: 'field-calibration',
      detail:
        'Without the amplifier voltage gain, no DSP-side limiter threshold can be calculated. Measure ' +
        'the output voltage at a known DSP output level instead.',
    });
  }

  if (!amp.gainControlPosition) {
    warnings.push(
      'Gain control / attenuator position is not documented. Any threshold derived from gain is only ' +
        'valid while that control stays where it was during calibration.',
    );
  }

  // ----- Maximum safe input level -----
  const maxSafeInput =
    isKnown(maxRms) && isKnown(gain)
      ? tracked(vrmsToDbu(maxRms.value) - gain.value, 'dBu', 'level', 'calculated', gain.certainty, {
          formula:
            `Max safe input (dBu) = 20 * log10(Vrms(max) / 0.775) - Voltage Gain = ` +
            `${vrmsToDbu(maxRms.value).toFixed(3)} dBu - ${gain.value.toFixed(3)} dB`,
          sources: ['Maximum output voltage', 'Voltage gain'],
          notes: [
            'This is the RMS input level at which the amplifier reaches its maximum RMS output. It is a ' +
              'clipping threshold, not a loudspeaker protection limit.',
          ],
        })
      : unknown('dBu', 'level', 'Needs both a maximum output voltage and a voltage gain.');

  if (amp.maxInputLevel.value !== null && isKnown(maxSafeInput)) {
    const declared = amp.maxInputLevelUnit === 'Vrms'
      ? vrmsToDbu(amp.maxInputLevel.value)
      : amp.maxInputLevelUnit === 'dBV'
        ? vrmsToDbu(dbvToVrms(amp.maxInputLevel.value))
        : amp.maxInputLevel.value;
    if (declared < maxSafeInput.value) {
      warnings.push(
        `The published maximum input level (${declared.toFixed(2)} dBu) is BELOW the level that drives ` +
          `the amplifier to full output (${maxSafeInput.value.toFixed(2)} dBu). The input stage limits first.`,
      );
    }
  }

  const maxPeak = isKnown(maxRms)
    ? tracked(maxRms.value * dbToRatio(SINE_CREST_FACTOR_DB), 'Vpeak', 'peak', 'calculated', 'low', {
        formula: `Vpeak = Vrms * sqrt(2) = ${maxRms.value.toFixed(3)} * 1.41421 (SINE waveform only)`,
        sources: ['Maximum RMS output voltage'],
        notes: [
          'This is the peak voltage of a SINE at the maximum RMS output. It is an explicit sine-domain ' +
            'crossing, not a statement about the amplifier peak voltage capability, which many ' +
            'amplifiers exceed for short bursts.',
        ],
      })
    : amp.maxOutputVoltage.value && amp.maxOutputVoltageIsPeak
      ? tracked(
          amp.maxOutputVoltage.value * dbToRatio(addedGain),
          'Vpeak',
          'peak',
          amp.maxOutputVoltage.status,
          'high',
          {
            formula: 'Published maximum PEAK output voltage.',
            sources: ['Maximum output voltage'],
          },
        )
      : unknown('Vpeak', 'peak', 'Needs a maximum output voltage.');

  if (loadOhm !== null && amp.minimumLoadOhm.value && loadOhm < amp.minimumLoadOhm.value - 1e-6) {
    warnings.push(
      `LOAD VIOLATION: the configured load of ${loadOhm.toFixed(2)} ohm is below the amplifier minimum ` +
        `of ${amp.minimumLoadOhm.value} ohm in ${amp.mode} mode.`,
    );
  }

  return { gainDb: gain, maxOutputVrms: maxRms, maxOutputVpeak: maxPeak, maxSafeInputDbu: maxSafeInput, warnings, missing };
}
