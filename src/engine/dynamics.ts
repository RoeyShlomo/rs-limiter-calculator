/**
 * RS Limiter Calculator — dynamic parameters.
 *
 * There is NO single universal formula for attack and release. The period-based
 * figures produced here are educational references for understanding the time
 * scales involved; they are not protection guarantees. Manufacturer-recommended
 * settings always take priority and can be entered verbatim.
 */

import { LimiterType, ProtectionDomain, DetectionMode } from './types';

export type ParameterId =
  | 'threshold'
  | 'attack'
  | 'release'
  | 'hold'
  | 'ratio'
  | 'knee'
  | 'lookahead'
  | 'detection'
  | 'rmsIntegration'
  | 'crestFactor';

export interface ParameterInfo {
  id: ParameterId;
  /** i18n key suffix; text lives in the translation files. */
  key: string;
  unit: string;
}

export const PARAMETERS: ParameterInfo[] = [
  { id: 'threshold', key: 'threshold', unit: 'dB / V' },
  { id: 'attack', key: 'attack', unit: 'ms' },
  { id: 'release', key: 'release', unit: 'ms / s' },
  { id: 'hold', key: 'hold', unit: 'ms' },
  { id: 'ratio', key: 'ratio', unit: ':1' },
  { id: 'knee', key: 'knee', unit: 'dB' },
  { id: 'lookahead', key: 'lookahead', unit: 'ms' },
  { id: 'detection', key: 'detection', unit: '-' },
  { id: 'rmsIntegration', key: 'rmsIntegration', unit: 'ms' },
  { id: 'crestFactor', key: 'crestFactor', unit: 'dB' },
];

/** One period of the lowest frequency the band must pass. Educational reference only. */
export function periodMs(frequencyHz: number): number {
  return 1000 / frequencyHz;
}

export interface TimingReference {
  /** Period of the lower cutoff frequency, in ms. */
  periodMs: number | null;
  /** Commonly cited multiples of that period, as a reference range. */
  attackRangeMs: [number, number] | null;
  releaseRangeMs: [number, number] | null;
  /** Why this is a reference and not a recommendation. */
  caveats: string[];
  /** Domain-specific engineering guidance keys for the UI. */
  guidanceKeys: string[];
}

export interface TimingInput {
  limiterType: LimiterType;
  domain: ProtectionDomain;
  lowerCutoffHz: number | null;
  upperCutoffHz: number | null;
  detectionMode: DetectionMode;
  /** Thermal time constant from the manufacturer, when published. */
  thermalTimeConstantS?: number | null;
  band: 'sub' | 'low' | 'mid' | 'high' | 'full';
}

const UNIVERSAL_CAVEATS = [
  'No single universal formula exists for attack and release. These figures are time-scale references ' +
    'derived from the band edge, not protection guarantees.',
  'Manufacturer-recommended limiter settings, where published, take priority over any calculated figure.',
  'The detector implementation, its integration time and its internal gain structure differ between ' +
    'devices, so the same numeric attack value does not produce the same protection in two different DSPs.',
];

export function timingReference(input: TimingInput): TimingReference {
  const caveats = [...UNIVERSAL_CAVEATS];
  const guidanceKeys: string[] = [];
  const f = input.lowerCutoffHz;
  const p = f && f > 0 ? periodMs(f) : null;

  let attackRange: [number, number] | null = null;
  let releaseRange: [number, number] | null = null;

  if (input.limiterType === 'clip') {
    attackRange = [0, 1];
    releaseRange = [10, 200];
    guidanceKeys.push('clipFast');
    caveats.push(
      'A clip limiter protects the amplifier from driving into its rails. It does not protect the ' +
        'loudspeaker from thermal overload or from excursion.',
    );
  } else if (input.limiterType === 'compressor') {
    guidanceKeys.push('compressorRatio');
    caveats.push(
      'A compressor with a finite ratio lets the level continue to rise above the threshold. It bounds ' +
        'the level only asymptotically, so it is not a protection device unless the ratio is very high ' +
        'and the maximum input level is bounded.',
    );
  } else if (input.limiterType === 'single-unspecified') {
    guidanceKeys.push('singleLimiter');
    caveats.push(
      'A single limiter with no RMS / peak separation must be assigned to ONE domain. The other domain ' +
        'remains unprotected and that must be stated in the documentation.',
    );
  } else if (input.domain === 'peak' || input.limiterType === 'peak') {
    // Excursion protection must act within the time scale of the waveform itself.
    attackRange = p ? [Math.min(1, p / 4), p] : null;
    releaseRange = p ? [p * 2, p * 20] : null;
    guidanceKeys.push('peakFast', 'peakLookahead');
    caveats.push(
      'A peak limiter without lookahead cannot stop the first transient edge. The overshoot that passes ' +
        'during the attack time is what reaches the loudspeaker.',
    );
  } else if (input.domain === 'thermal' || input.limiterType === 'rms') {
    // Thermal protection follows the voice coil heating time constant, not the waveform.
    const tc = input.thermalTimeConstantS;
    attackRange = tc ? [tc * 1000 * 0.1, tc * 1000 * 0.5] : p ? [p * 10, p * 100] : null;
    releaseRange = tc ? [tc * 1000, tc * 1000 * 5] : [500, 5000];
    guidanceKeys.push('thermalSlow', 'thermalIntegration');
    caveats.push(
      'Thermal protection follows voice-coil heating, whose time constant is seconds to tens of seconds. ' +
        'An attack short enough for transients makes a thermal limiter act as a compressor and audibly ' +
        'reduces dynamics without improving thermal protection.',
    );
  }

  if (input.band === 'sub' || (f !== null && f !== undefined && f <= 60)) {
    guidanceKeys.push('subBand');
    caveats.push(
      'In the sub band a single cycle lasts 10-50 ms. A fast attack and release there produces audible ' +
        'modulation of the fundamental, while a slow attack lets several cycles of overshoot through.',
    );
  }
  if (input.band === 'high') {
    guidanceKeys.push('hfBand');
    caveats.push(
      'High-frequency drivers have very little thermal mass and fail quickly. Published HF limiter ' +
        'settings from the manufacturer should be used in preference to any derived figure.',
    );
  }
  if (input.detectionMode === 'unknown') {
    caveats.push(
      'The detector mode is unknown. Whether the detector follows peaks or an RMS average changes the ' +
        'effective threshold for real programme material by the crest factor of that material.',
    );
  }

  return { periodMs: p, attackRangeMs: attackRange, releaseRangeMs: releaseRange, caveats, guidanceKeys };
}

/**
 * How much a given crest factor shifts the effective protection point of an
 * RMS detector fed with real programme material.
 */
export function crestFactorEffect(signalCrestDb: number): {
  peakAboveThresholdDb: number;
  note: string;
} {
  return {
    peakAboveThresholdDb: signalCrestDb,
    note:
      `With an RMS detector, programme material of ${signalCrestDb.toFixed(1)} dB crest factor reaches ` +
      `peaks ${signalCrestDb.toFixed(1)} dB above the RMS threshold. The thermal limiter is working ` +
      'correctly while those peaks pass; stopping them is the peak limiter task.',
  };
}
