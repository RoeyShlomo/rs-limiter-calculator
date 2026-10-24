/**
 * RS Limiter Calculator — loudspeaker-derived voltage limits.
 *
 * Hard rules enforced here:
 *  - A published voltage limit always outranks a power-derived figure.
 *  - An AES / Continuous rating alone NEVER yields a mechanically safe peak limit.
 *  - A "Peak Power" rating is only usable once the user states how to read it.
 *  - Power figures from nominal impedance are equivalent values, never true power.
 */

import { Loudspeaker, SpeakerGroup } from './types';
import { Tracked, tracked, unknown, MissingDatum, isKnown } from './status';
import { trackedVrmsFromPower, trackedEquivalentPower } from './power';
import { amplifierVoltageForSpeakerLimit, computeLoad, LoadResult, normalizeGroup } from './load';

export interface SpeakerLimits {
  /** Thermal RMS voltage limit across ONE loudspeaker. */
  rmsPerSpeaker: Tracked;
  /** Mechanical / peak voltage limit across ONE loudspeaker. */
  peakPerSpeaker: Tracked;
  /** Same limits referred to the amplifier output terminals. */
  rmsAtAmplifier: Tracked;
  peakAtAmplifier: Tracked;
  /** Equivalent power at the thermal limit, for reporting only. */
  equivalentPower: Tracked;
  load: LoadResult;
  missing: MissingDatum[];
  warnings: string[];
}

const AES_ONLY_PEAK_NOTE =
  'An AES / Continuous rating describes thermal capability over a defined test period. It carries ' +
  'no information about excursion or mechanical peak capability, so no peak voltage limit can be ' +
  'derived from it. Enter a published peak voltage, a peak power rating with its stated meaning, ' +
  'or obtain the manufacturer excursion limit.';

export function loudspeakerLimits(ls: Loudspeaker, group: SpeakerGroup): SpeakerLimits {
  const missing: MissingDatum[] = [];
  const warnings: string[] = [];

  const znom = ls.nominalImpedance.value;
  const zmin = ls.minimumImpedance.value;

  // ----- Thermal RMS voltage limit -----
  let rms: Tracked;
  if (isEntry(ls.publishedRmsVoltage)) {
    rms = tracked(ls.publishedRmsVoltage.value!, 'Vrms', 'rms', ls.publishedRmsVoltage.status, 'high', {
      formula: 'Published RMS voltage limit used directly (no impedance assumption required).',
      sources: ['Published RMS voltage limit'],
    });
  } else {
    const thermalPower = pickThermalPower(ls);
    if (thermalPower && znom && znom > 0) {
      rms = trackedVrmsFromPower({
        powerW: thermalPower.watts,
        impedanceOhm: znom,
        powerStatus: thermalPower.status,
        impedanceStatus: ls.nominalImpedance.status,
        powerCertainty: 'medium',
        impedanceCertainty: 'medium',
        labels: [thermalPower.label, 'Nominal impedance'],
        impedanceIsNominal: true,
      });
      rms.notes = [
        ...(rms.notes ?? []),
        `Thermal limit derived from the ${thermalPower.label} rating. A thermal limiter set from this ` +
          'figure protects against long-term heating only, not excursion and not amplifier clipping.',
      ];
    } else {
      rms = unknown(
        'Vrms',
        'rms',
        'No published RMS voltage limit and no usable combination of a continuous power rating with a nominal impedance.',
      );
      if (!thermalPower)
        missing.push({
          field: 'AES / Continuous power or published RMS voltage',
          blocks: ['thermal'],
          remedy: 'enter-specification',
          detail: 'A thermal voltage limit needs either a published RMS voltage limit or a continuous power rating.',
        });
      if (!znom)
        missing.push({
          field: 'Nominal impedance',
          blocks: ['thermal', 'clip'],
          remedy: 'enter-specification',
          detail: 'Nominal impedance is needed to convert a power rating into an RMS voltage.',
        });
    }
  }

  // ----- Mechanical / peak voltage limit -----
  let peak: Tracked;
  if (isEntry(ls.publishedPeakVoltage)) {
    peak = tracked(ls.publishedPeakVoltage.value!, 'Vpeak', 'peak', ls.publishedPeakVoltage.status, 'high', {
      formula: 'Published peak voltage limit used directly.',
      sources: ['Published peak voltage limit'],
    });
  } else if (isEntry(ls.peakPower) && znom && znom > 0 && ls.peakPowerInterpretation !== 'unknown') {
    const v = Math.sqrt(ls.peakPower.value! * znom);
    if (ls.peakPowerInterpretation === 'peak-voltage') {
      peak = tracked(v, 'Vpeak', 'peak', 'estimated', 'low', {
        formula: `Vpeak = sqrt(Ppeak * Znom) = sqrt(${ls.peakPower.value} W * ${znom} ohm)`,
        sources: ['Peak power rating', 'Nominal impedance', 'Stated peak-power interpretation'],
        notes: [
          'Peak power ratings are not standardised between manufacturers. This figure follows the ' +
            'interpretation you selected (peak voltage) and must be verified against manufacturer ' +
            'excursion data before it is treated as a mechanical protection limit.',
        ],
      });
    } else {
      peak = tracked(v, 'Vrms', 'rms', 'estimated', 'low', {
        formula: `Vrms(burst) = sqrt(Ppeak * Znom) = sqrt(${ls.peakPower.value} W * ${znom} ohm)`,
        sources: ['Peak power rating', 'Nominal impedance', 'Stated peak-power interpretation'],
        notes: [
          'You selected the short-burst RMS interpretation, so this is an RMS figure, NOT a peak ' +
            'voltage. Crossing into the peak domain requires an explicit crest factor.',
        ],
      });
    }
    warnings.push(
      'The peak / mechanical limit is an ESTIMATE derived from a power rating. It is not a verified ' +
        'excursion limit.',
    );
  } else {
    peak = unknown('Vpeak', 'peak', AES_ONLY_PEAK_NOTE);
    missing.push({
      field: 'Published peak voltage, or peak power with its stated meaning',
      blocks: ['peak'],
      remedy: 'enter-specification',
      detail: AES_ONLY_PEAK_NOTE,
    });
  }

  if (!isEntry(ls.xmaxMm) && !ls.mechanicalNotes) {
    missing.push({
      field: 'Xmax / mechanical excursion limit',
      blocks: ['peak'],
      remedy: 'enter-specification',
      detail:
        'Without excursion data, no statement about mechanical safety can be verified, particularly ' +
        'below the recommended lower cutoff frequency.',
    });
  }

  if (!isEntry(ls.lowerCutoffHz)) {
    warnings.push(
      'No lower cutoff frequency entered. Excursion rises rapidly below a cabinet tuning frequency, so ' +
        'a thermal limiter alone will not prevent mechanical damage from sub-band content.',
    );
  }

  if (zmin && znom && zmin < znom) {
    warnings.push(
      `Minimum impedance (${zmin} ohm) is below nominal (${znom} ohm). Real current draw and real power ` +
        'are higher than the nominal-impedance equivalents shown here.',
    );
  }

  const load = computeLoad(znom ?? 0, group, {
    impedanceStatus: ls.nominalImpedance.status,
    impedanceCertainty: 'medium',
    isNominal: true,
  });

  // ----- Refer limits to the amplifier terminals -----
  const rmsAmp = referToAmplifier(rms, group);
  const peakAmp = referToAmplifier(peak, group);

  const equivalentPower =
    isKnown(rms) && znom && znom > 0
      ? trackedEquivalentPower(rms.value, znom, {
          voltageStatus: rms.status,
          impedanceStatus: ls.nominalImpedance.status,
          voltageCertainty: rms.certainty,
          impedanceCertainty: 'medium',
          labels: ['Thermal RMS voltage limit', 'Nominal impedance'],
        })
      : unknown('W', 'power', 'Needs a thermal RMS voltage limit and a nominal impedance.');

  return {
    rmsPerSpeaker: rms,
    peakPerSpeaker: peak,
    rmsAtAmplifier: rmsAmp,
    peakAtAmplifier: peakAmp,
    equivalentPower,
    load,
    missing,
    warnings,
  };
}

function referToAmplifier(t: Tracked, group: SpeakerGroup): Tracked {
  if (!isKnown(t)) return { ...t };
  const { series } = normalizeGroup(group);
  const v = amplifierVoltageForSpeakerLimit(t.value, group);
  if (series <= 1) return { ...t, value: v };
  return {
    ...t,
    value: v,
    formula: `${t.formula ?? 'Per-loudspeaker limit'} ; referred to amplifier: V = Vspeaker * seriesCount = ${t.value.toFixed(3)} * ${series}`,
    notes: [
      ...(t.notes ?? []),
      'Referred to the amplifier terminals through the series connection. This assumes the drivers ' +
        'share voltage equally, which real impedance differences do not guarantee.',
    ],
  };
}

function isEntry(e: { value: number | null }): boolean {
  return e.value !== null && Number.isFinite(e.value) && e.value > 0;
}

function pickThermalPower(
  ls: Loudspeaker,
): { watts: number; label: string; status: Loudspeaker['aesPower']['status'] } | null {
  if (isEntry(ls.aesPower)) return { watts: ls.aesPower.value!, label: 'AES power', status: ls.aesPower.status };
  if (isEntry(ls.continuousPower))
    return { watts: ls.continuousPower.value!, label: 'Continuous power', status: ls.continuousPower.status };
  return null;
}
