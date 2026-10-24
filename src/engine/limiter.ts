/**
 * RS Limiter Calculator — limiter threshold engine.
 *
 * For each protection domain (thermal, peak/mechanical, amplifier clip) the engine
 * takes the MOST RESTRICTIVE limit available, applies the domain safety margin,
 * refers it back through the amplifier voltage gain and any post-limiter gain, and
 * expresses it in the DSP's own units.
 *
 * It refuses to produce a number when the data needed to make that number safe is
 * missing, and never crosses between the RMS and peak domains without an explicit
 * crest factor.
 */

import {
  Amplifier,
  ChannelConfig,
  DspDevice,
  LimiterStage,
  Loudspeaker,
  ProtectionDomain,
  ThresholdScale,
} from './types';
import { Tracked, tracked, unknown, isKnown, MissingDatum, Certainty, worstCertainty } from './status';
import { analyzeAmplifier, AmplifierAnalysis } from './amplifier';
import { loudspeakerLimits, SpeakerLimits } from './loudspeaker';
import { chainGains, ChainGains } from './chain';
import { dspReference, DspReference, expressThreshold, CONVENTION_LABELS } from './dsp';
import { dbToRatio, vrmsToDbu, dbuToVrms, ratioToDb, SINE_CREST_FACTOR_DB, vrmsToDbv } from './units';
import { trackedEquivalentPower } from './power';

export const DOMAIN_LABELS: Record<ProtectionDomain, string> = {
  thermal: 'Thermal (long-term heating)',
  peak: 'Mechanical / excursion (peak)',
  clip: 'Amplifier clipping',
};

export interface DomainAnalysis {
  domain: ProtectionDomain;
  /** Limit at the amplifier output terminals, before the safety margin. */
  limitAtAmplifier: Tracked;
  /** Which element set the limit. */
  governedBy: 'loudspeaker' | 'amplifier' | 'none';
  /** All candidate limits considered, for the audit trail. */
  candidates: { source: string; value: Tracked }[];
  marginDb: number;
  /** Target at the amplifier output after the margin. */
  targetAtAmplifier: Tracked;
  /** Equivalent power at the target, reporting only. */
  equivalentPower: Tracked;
  /** Target expressed as a level, RMS domain only. */
  targetLevelDbu: Tracked;
  /** Level that must leave the DSP analog output. */
  requiredDspOutputDbu: Tracked;
  /** Threshold at the limiter node, in dBu, accounting for post-limiter gain. */
  thresholdAtLimiterDbu: Tracked;
  /** Threshold in the DSP's own scale. */
  threshold: Tracked;
  /** Alternative renderings of the same threshold. */
  alternates: { scale: ThresholdScale; value: Tracked }[];
  missing: MissingDatum[];
  warnings: string[];
  /** True only when every contributing figure was measured or manufacturer-specified. */
  fieldVerified: boolean;
}

export interface ChannelAnalysis {
  channelId: string;
  channelName: string;
  speaker: SpeakerLimits | null;
  amp: AmplifierAnalysis | null;
  gains: ChainGains;
  dspRef: DspReference;
  totalLoadOhm: number | null;
  domains: Record<ProtectionDomain, DomainAnalysis>;
  missing: MissingDatum[];
  warnings: string[];
  /** Blocking statement shown when no safe output is possible at all. */
  blocked: boolean;
}

const MARGIN_NOTE =
  'The safety margin is a design decision, not a protection guarantee. -3 dB below a rated continuous ' +
  'power is a conventional starting point only: it does not account for programme crest factor, ' +
  'ambient temperature, duty cycle, or content below the cabinet tuning frequency.';

function marginFor(domain: ProtectionDomain, c: ChannelConfig): number {
  if (domain === 'thermal') return c.margins.thermalDb;
  if (domain === 'peak') return c.margins.peakDb;
  return c.margins.clipDb;
}

/** Most restrictive of a set of candidate limits in the same domain. */
function mostRestrictive(
  candidates: { source: string; value: Tracked }[],
): { chosen: Tracked | null; governedBy: 'loudspeaker' | 'amplifier' | 'none' } {
  let chosen: Tracked | null = null;
  let who: 'loudspeaker' | 'amplifier' | 'none' = 'none';
  for (const c of candidates) {
    if (!isKnown(c.value)) continue;
    if (chosen === null || c.value.value < (chosen.value as number)) {
      chosen = c.value;
      who = c.source === 'Amplifier' ? 'amplifier' : 'loudspeaker';
    }
  }
  return { chosen, governedBy: who };
}

function applyMargin(limit: Tracked, marginDb: number, domain: ProtectionDomain): Tracked {
  if (!isKnown(limit)) return { ...limit };
  const v = limit.value * dbToRatio(marginDb);
  return tracked(v, limit.unit, limit.domain, 'calculated', worstCertainty(limit.certainty, 'medium'), {
    formula: `V(target) = V(limit) * 10^(margin / 20) = ${limit.value.toFixed(4)} * 10^(${marginDb} / 20)`,
    sources: [`${DOMAIN_LABELS[domain]} limit`, 'Safety margin'],
    notes: [MARGIN_NOTE, ...(limit.notes ?? [])],
  });
}

/**
 * dBFS reading a PEAK-reading meter shows for a given peak voltage.
 *  - Peak-referenced convention: digital full scale peak = 0 dBFS.
 *  - AES17: the full-scale sine RMS is 0 dBFS, so its peak reads +3.01 dBFS.
 */
function peakThresholdDbfs(vpeak: number, ref: DspReference): Tracked {
  if (!ref.usable || ref.analogFullScaleDbu === null) {
    return unknown(
      'dBFS',
      'peak',
      'No verified dBFS reference, so no peak threshold in dBFS can be stated.',
    );
  }
  const vrmsFs = dbuToVrms(ref.analogFullScaleDbu);
  const vpeakFs = vrmsFs * Math.SQRT2;
  const meterOffset = ref.convention === 'aes17' ? SINE_CREST_FACTOR_DB : 0;
  return tracked(ratioToDb(vpeak / vpeakFs) + meterOffset, 'dBFS', 'peak', 'calculated', 'medium', {
    formula:
      `Threshold (dBFS, peak meter) = 20 * log10(Vpeak / Vpeak(full scale)) + meter offset = ` +
      `20 * log10(${vpeak.toFixed(4)} / ${vpeakFs.toFixed(4)}) + ${meterOffset.toFixed(3)}`,
    sources: ['Required peak voltage at the limiter node', 'Analog full-scale reference', 'dBFS convention'],
    notes: [
      `Convention: ${CONVENTION_LABELS[ref.convention]}. Full-scale peak is taken as the peak of a ` +
        'full-scale sine at the stated analog full-scale level.',
      'This is a PEAK-domain figure. Do not enter it into an RMS-referenced threshold field.',
    ],
  });
}

function expressPeakThreshold(
  vpeakAtLimiter: number,
  scale: ThresholdScale,
  ref: DspReference,
  stage: LimiterStage,
  impedanceOhm: number | null,
): Tracked {
  if (stage.peakThresholdReference === 'unknown') {
    return unknown(
      'dB',
      'peak',
      'The peak limiter threshold reference is not established: it is unknown whether the displayed ' +
        'value means peak voltage or the RMS of a sine at that peak. The two differ by 3.01 dB. State ' +
        'the reference from the manufacturer documentation, or establish it by measurement.',
    );
  }

  if (stage.peakThresholdReference === 'rms-of-sine') {
    const vrms = vpeakAtLimiter / Math.SQRT2;
    const dbu = vrmsToDbu(vrms);
    const t = expressThreshold(dbu, scale, ref, { impedanceOhm });
    return {
      ...t,
      notes: [
        'The DSP peak threshold is referenced to the RMS of a sine at the target peak, as you declared. ' +
          `Explicit peak -> RMS crossing with the sine crest factor of ${SINE_CREST_FACTOR_DB.toFixed(2)} dB.`,
        ...(t.notes ?? []),
      ],
    };
  }

  // peakThresholdReference === 'peak'
  switch (scale) {
    case 'Vpeak':
      return tracked(vpeakAtLimiter, 'Vpeak', 'peak', 'calculated', 'medium', {
        formula: 'Required peak voltage at the limiter node, used directly.',
        sources: ['Peak target at the amplifier output', 'Amplifier voltage gain', 'Post-limiter gain'],
      });
    case 'dBFS':
      return peakThresholdDbfs(vpeakAtLimiter, ref);
    case 'dBu':
      return tracked(vrmsToDbu(vpeakAtLimiter), 'dBu', 'peak', 'calculated', 'medium', {
        formula: `Threshold = 20 * log10(Vpeak / 0.775) = 20 * log10(${vpeakAtLimiter.toFixed(4)} / 0.775)`,
        sources: ['Required peak voltage at the limiter node'],
        notes: [
          'Peak-referenced value on a dBu-style scale, as you declared for this device. The number is a ' +
            'PEAK voltage expressed in dBu notation, not an RMS level.',
        ],
      });
    case 'dBV':
      return tracked(vrmsToDbv(vpeakAtLimiter), 'dBV', 'peak', 'calculated', 'medium', {
        formula: `Threshold = 20 * log10(Vpeak / 1) = 20 * log10(${vpeakAtLimiter.toFixed(4)})`,
        sources: ['Required peak voltage at the limiter node'],
        notes: ['Peak-referenced value on a dBV-style scale, as you declared for this device.'],
      });
    case 'Vrms':
      return unknown(
        'Vrms',
        'rms',
        'The threshold scale is RMS volts but you declared the peak limiter to be peak-referenced. ' +
          'These are different domains; resolve the device documentation before setting a value.',
      );
    default:
      return unknown(
        'dB',
        'peak',
        'This scale has no defined meaning for a peak-referenced threshold until its relationship to ' +
          'volts or dBFS is entered.',
      );
  }
}

export interface AnalyzeInput {
  channel: ChannelConfig;
  loudspeaker: Loudspeaker | null;
  amplifier: Amplifier | null;
  dsp: DspDevice | null;
  /** Measured calibration overriding the computed amplifier gain, when present. */
  measuredGainDb?: number | null;
}

export function analyzeChannel(input: AnalyzeInput): ChannelAnalysis {
  const { channel, loudspeaker, amplifier, dsp } = input;
  const missing: MissingDatum[] = [];
  const warnings: string[] = [];

  const speaker = loudspeaker ? loudspeakerLimits(loudspeaker, channel.group) : null;
  if (!loudspeaker)
    missing.push({
      field: 'Loudspeaker',
      blocks: ['thermal', 'peak'],
      remedy: 'enter-specification',
      detail: 'No loudspeaker is assigned to this channel.',
    });

  const totalLoadOhm = speaker && isKnown(speaker.load.totalImpedance) ? speaker.load.totalImpedance.value : null;
  const amp = amplifier ? analyzeAmplifier(amplifier, totalLoadOhm) : null;
  if (!amplifier)
    missing.push({
      field: 'Amplifier',
      blocks: ['thermal', 'peak', 'clip'],
      remedy: 'enter-specification',
      detail: 'No amplifier is assigned to this channel.',
    });

  const gains = chainGains(channel.chain);
  const dspRef = dspReference(dsp);

  if (speaker) missing.push(...speaker.missing);
  if (amp) missing.push(...amp.missing);
  missing.push(...dspRef.missing);
  if (speaker) warnings.push(...speaker.warnings);
  if (amp) warnings.push(...amp.warnings);
  warnings.push(...gains.warnings);

  // Amplifier voltage gain, optionally replaced by a field measurement.
  let ampGain: Tracked = amp ? amp.gainDb : unknown('dB', 'ratio', 'No amplifier assigned.');
  if (input.measuredGainDb !== null && input.measuredGainDb !== undefined && Number.isFinite(input.measuredGainDb)) {
    ampGain = tracked(input.measuredGainDb, 'dB', 'ratio', 'measured', 'high', {
      formula: 'Voltage Gain (dB) = 20 * log10(Vout measured / Vin at the DSP output)',
      sources: ['Field calibration measurement'],
      notes: ['Measured gain overrides the published or derived figure for this channel.'],
    });
  }

  const domains = {} as Record<ProtectionDomain, DomainAnalysis>;
  for (const domain of ['thermal', 'peak', 'clip'] as ProtectionDomain[]) {
    domains[domain] = analyzeDomain({
      domain,
      channel,
      speaker,
      amp,
      ampGain,
      gains,
      dspRef,
      dsp,
      totalLoadOhm,
    });
  }

  // A single limiter with no RMS / peak separation cannot serve both domains.
  const single = dsp?.limiters.find((l) => l.type === 'single-unspecified');
  if (single) {
    warnings.push(
      'This device is configured as a single limiter with no RMS / peak separation. One threshold cannot ' +
        'protect against long-term heating and against excursion at the same time. Decide which domain ' +
        'it serves, and state that the other domain is unprotected.',
    );
  }
  if (dsp && !dsp.limiters.some((l) => l.protects === 'peak')) {
    warnings.push(
      'No peak limiter is configured. A thermal limiter alone does not prevent excursion damage or ' +
        'amplifier clipping.',
    );
  }
  if (dsp && !dsp.limiters.some((l) => l.protects === 'thermal')) {
    warnings.push(
      'No thermal / RMS limiter is configured. A peak limiter alone does NOT provide complete ' +
        'loudspeaker protection: it cannot prevent long-term thermal overload.',
    );
  }

  const blocked = !Object.values(domains).some((d) => isKnown(d.threshold));

  return {
    channelId: channel.id,
    channelName: channel.name,
    speaker,
    amp,
    gains,
    dspRef,
    totalLoadOhm,
    domains,
    missing: dedupeMissing(missing),
    warnings: Array.from(new Set(warnings)),
    blocked,
  };
}

interface DomainInput {
  domain: ProtectionDomain;
  channel: ChannelConfig;
  speaker: SpeakerLimits | null;
  amp: AmplifierAnalysis | null;
  ampGain: Tracked;
  gains: ChainGains;
  dspRef: DspReference;
  dsp: DspDevice | null;
  totalLoadOhm: number | null;
}

function analyzeDomain(d: DomainInput): DomainAnalysis {
  const { domain, channel, speaker, amp, ampGain, gains, dspRef, dsp, totalLoadOhm } = d;
  const missing: MissingDatum[] = [];
  const warnings: string[] = [];
  const candidates: { source: string; value: Tracked }[] = [];

  if (domain === 'thermal') {
    if (speaker) candidates.push({ source: 'Loudspeaker', value: speaker.rmsAtAmplifier });
    if (amp) candidates.push({ source: 'Amplifier', value: amp.maxOutputVrms });
  } else if (domain === 'peak') {
    if (speaker && speaker.peakAtAmplifier.domain === 'peak')
      candidates.push({ source: 'Loudspeaker', value: speaker.peakAtAmplifier });
    else if (speaker)
      warnings.push(
        'The loudspeaker peak figure available is an RMS-domain value, so it is not used as a peak ' +
          'limit. Crossing domains requires an explicit crest factor.',
      );
    if (amp) candidates.push({ source: 'Amplifier', value: amp.maxOutputVpeak });
  } else {
    if (amp) candidates.push({ source: 'Amplifier', value: amp.maxOutputVrms });
  }

  const { chosen, governedBy } = mostRestrictive(candidates);
  const marginDb = marginFor(domain, channel);

  const limitAtAmplifier =
    chosen ??
    unknown(
      domain === 'peak' ? 'Vpeak' : 'Vrms',
      domain === 'peak' ? 'peak' : 'rms',
      domain === 'peak'
        ? 'No usable peak voltage limit from either the loudspeaker or the amplifier.'
        : 'No usable voltage limit from either the loudspeaker or the amplifier.',
    );

  const targetAtAmplifier = applyMargin(limitAtAmplifier, marginDb, domain);

  const equivalentPower =
    isKnown(targetAtAmplifier) && totalLoadOhm && targetAtAmplifier.domain === 'rms'
      ? trackedEquivalentPower(targetAtAmplifier.value, totalLoadOhm, {
          voltageStatus: targetAtAmplifier.status,
          voltageCertainty: targetAtAmplifier.certainty,
          impedanceCertainty: 'medium',
          labels: ['Target RMS voltage', 'Total nominal load'],
        })
      : unknown(
          'W',
          'power',
          domain === 'peak'
            ? 'An equivalent power is not stated for a peak-domain target: power is an RMS-domain quantity.'
            : 'Needs a target voltage and a total load impedance.',
        );

  // ----- Refer the target back to the limiter node -----
  const postGain = isKnown(gains.postLimiterDb) ? gains.postLimiterDb.value : null;
  const stage = pickStage(dsp, domain);

  let targetLevelDbu: Tracked;
  let requiredDspOutputDbu: Tracked;
  let thresholdAtLimiterDbu: Tracked;
  let threshold: Tracked;
  const alternates: { scale: ThresholdScale; value: Tracked }[] = [];

  const haveGain = isKnown(ampGain) && postGain !== null;

  if (domain === 'peak' && isKnown(targetAtAmplifier)) {
    // Peak domain: stay in peak volts through the gain stages.
    targetLevelDbu = unknown(
      'dBu',
      'peak',
      'A peak target is not expressed in dBu, which is an RMS-referenced unit, unless the device ' +
        'scale is declared peak-referenced.',
    );
    if (haveGain) {
      const gainRatio = dbToRatio(ampGain.value + (postGain as number));
      const vpeakAtLimiter = targetAtAmplifier.value / gainRatio;
      requiredDspOutputDbu = tracked(
        targetAtAmplifier.value / dbToRatio(ampGain.value),
        'Vpeak',
        'peak',
        'calculated',
        ampGain.certainty,
        {
          formula:
            `Vpeak(DSP output) = Vpeak(target at amplifier) / 10^(Amplifier Voltage Gain / 20) = ` +
            `${targetAtAmplifier.value.toFixed(4)} / 10^(${ampGain.value.toFixed(3)} / 20)`,
          sources: ['Peak target at the amplifier output', 'Amplifier voltage gain'],
        },
      );
      thresholdAtLimiterDbu = tracked(vpeakAtLimiter, 'Vpeak', 'peak', 'calculated', ampGain.certainty, {
        formula:
          `Vpeak(limiter node) = Vpeak(target) / 10^((Amplifier Voltage Gain + post-limiter gain) / 20) = ` +
          `${targetAtAmplifier.value.toFixed(4)} / 10^((${ampGain.value.toFixed(3)} + ${(postGain as number).toFixed(3)}) / 20)`,
        sources: ['Peak target at the amplifier output', 'Amplifier voltage gain', 'Post-limiter gain'],
      });
      threshold = stage
        ? expressPeakThreshold(vpeakAtLimiter, stage.thresholdScale, dspRef, stage, totalLoadOhm)
        : unknown('dB', 'peak', 'No peak limiter stage is configured on the DSP.');
      if (stage && stage.thresholdScale !== 'Vpeak')
        alternates.push({
          scale: 'Vpeak',
          value: tracked(vpeakAtLimiter, 'Vpeak', 'peak', 'calculated', ampGain.certainty, {
            formula: 'Required peak voltage at the limiter node.',
            sources: ['Peak target', 'Gain structure'],
          }),
        });
      if (stage && stage.thresholdScale !== 'dBFS')
        alternates.push({ scale: 'dBFS', value: peakThresholdDbfs(vpeakAtLimiter, dspRef) });
    } else {
      requiredDspOutputDbu = unknown('Vpeak', 'peak', 'Needs the amplifier voltage gain.');
      thresholdAtLimiterDbu = unknown('Vpeak', 'peak', 'Needs the amplifier voltage gain and the post-limiter gain.');
      threshold = unknown(
        'dB',
        'peak',
        'No peak threshold can be calculated without the amplifier voltage gain. Use the field ' +
          'calibration wizard to measure it.',
      );
    }
  } else if (isKnown(targetAtAmplifier) && targetAtAmplifier.domain === 'rms') {
    const dbu = vrmsToDbu(targetAtAmplifier.value);
    targetLevelDbu = tracked(dbu, 'dBu', 'level', 'calculated', targetAtAmplifier.certainty, {
      formula: `dBu = 20 * log10(Vrms / 0.775) = 20 * log10(${targetAtAmplifier.value.toFixed(4)} / 0.775)`,
      sources: ['Target RMS voltage at the amplifier output'],
    });
    if (haveGain) {
      const reqOut = dbu - ampGain.value;
      requiredDspOutputDbu = tracked(reqOut, 'dBu', 'level', 'calculated', ampGain.certainty, {
        formula:
          `Required DSP Output Level (dBu) = Target Amplifier Output Level (dBu) - Amplifier Voltage ` +
          `Gain (dB) = ${dbu.toFixed(3)} - ${ampGain.value.toFixed(3)}`,
        sources: ['Target amplifier output level', 'Amplifier voltage gain'],
      });
      const atLimiter = reqOut - (postGain as number);
      thresholdAtLimiterDbu = tracked(atLimiter, 'dBu', 'level', 'calculated', ampGain.certainty, {
        formula:
          `Threshold at limiter node (dBu) = Required DSP Output Level - post-limiter gain = ` +
          `${reqOut.toFixed(3)} - ${(postGain as number).toFixed(3)}`,
        sources: ['Required DSP output level', 'Post-limiter gain'],
        notes:
          postGain !== 0
            ? [
                'Post-limiter gain is included. If it changes, this threshold is no longer valid and must ' +
                  'be recalculated.',
              ]
            : undefined,
      });
      threshold = !stage
        ? unknown(
            'dB',
            'level',
            `No limiter stage on the DSP is assigned to the ${DOMAIN_LABELS[domain]} domain.`,
          )
        : stage.thresholdScale === 'W'
          ? // A threshold shown in watts denotes power at the amplifier output into the
            // stated load, not anything measurable at the DSP output.
            {
              ...equivalentPower,
              notes: [
                'A limiter threshold denominated in watts refers to the equivalent power at the ' +
                  'AMPLIFIER output into the stated load, not to any quantity at the DSP output. ' +
                  'Confirm which load the device figure assumes.',
                ...(equivalentPower.notes ?? []),
              ],
            }
          : expressThreshold(atLimiter, stage.thresholdScale, dspRef, {
              relativeReferenceDbu: dsp?.relativeReferenceDbu.value ?? null,
              crestFactorDb: channel.assumedCrestFactorDb,
              impedanceOhm: totalLoadOhm,
            });
      for (const s of ['dBu', 'dBFS', 'Vrms', 'dBV'] as ThresholdScale[]) {
        if (stage && s === stage.thresholdScale) continue;
        alternates.push({
          scale: s,
          value: expressThreshold(atLimiter, s, dspRef, {
            relativeReferenceDbu: dsp?.relativeReferenceDbu.value ?? null,
            crestFactorDb: channel.assumedCrestFactorDb,
            impedanceOhm: totalLoadOhm,
          }),
        });
      }
    } else {
      requiredDspOutputDbu = unknown('dBu', 'level', 'Needs the amplifier voltage gain.');
      thresholdAtLimiterDbu = unknown('dBu', 'level', 'Needs the amplifier voltage gain and the post-limiter gain.');
      threshold = unknown(
        'dB',
        'level',
        'No threshold can be calculated without the amplifier voltage gain. Use the field calibration ' +
          'wizard to measure the output voltage at a known DSP output level.',
      );
      missing.push({
        field: 'Amplifier voltage gain',
        blocks: [domain],
        remedy: 'field-calibration',
        detail: 'Measure the amplifier output voltage at a known, safe DSP output level.',
      });
    }
  } else {
    targetLevelDbu = unknown('dBu', 'level', 'No target voltage.');
    requiredDspOutputDbu = unknown('dBu', 'level', 'No target voltage.');
    thresholdAtLimiterDbu = unknown('dBu', 'level', 'No target voltage.');
    threshold = unknown(
      'dB',
      'level',
      domain === 'peak'
        ? 'No mechanically safe peak threshold can be stated from the data entered.'
        : 'Insufficient data for this protection domain.',
    );
  }

  if (!stage && dsp) {
    missing.push({
      field: `Limiter stage for the ${DOMAIN_LABELS[domain]} domain`,
      blocks: [domain],
      remedy: 'enter-specification',
      detail: 'Add a limiter on the DSP and assign it to this protection domain.',
    });
  }

  if (domain === 'peak' && governedBy === 'amplifier' && isKnown(limitAtAmplifier)) {
    warnings.push(
      'The peak limit is set by the amplifier, not by verified loudspeaker excursion data. This protects ' +
        'against amplifier clipping, not against mechanical damage.',
    );
  }

  // 'Field verified' requires that measurement data was actually entered: a chain of
  // published specifications alone is a PLAN, never a verified calibration.
  const contributing = [limitAtAmplifier.status, ampGain.status];
  if (threshold.unit === 'dBFS') contributing.push(dspRef.analogFullScaleStatus);
  const fieldVerified =
    isKnown(threshold) &&
    gains.undefinedStages.length === 0 &&
    contributing.every((s) => s === 'measured' || s === 'manufacturer') &&
    contributing.includes('measured');

  return {
    domain,
    limitAtAmplifier,
    governedBy,
    candidates,
    marginDb,
    targetAtAmplifier,
    equivalentPower,
    targetLevelDbu,
    requiredDspOutputDbu,
    thresholdAtLimiterDbu,
    threshold,
    alternates,
    missing,
    warnings,
    fieldVerified,
  };
}

/**
 * Only a limiter the user actually assigned to this domain serves it.
 *
 * A single limiter with no RMS / peak separation is NOT reused across domains: it
 * can serve one domain at a time, so producing a threshold for the others would
 * present protection the device cannot deliver.
 */
function pickStage(dsp: DspDevice | null, domain: ProtectionDomain): LimiterStage | null {
  if (!dsp) return null;
  return dsp.limiters.find((l) => l.protects === domain) ?? null;
}

function dedupeMissing(items: MissingDatum[]): MissingDatum[] {
  const seen = new Map<string, MissingDatum>();
  for (const m of items) {
    const prev = seen.get(m.field);
    if (prev) {
      prev.blocks = Array.from(new Set([...prev.blocks, ...m.blocks]));
    } else {
      seen.set(m.field, { ...m, blocks: [...m.blocks] });
    }
  }
  return Array.from(seen.values());
}

export { peakThresholdDbfs };
export type { Certainty };
