/**
 * RS Limiter Calculator — loudspeaker load topology.
 *
 * Models seriesCount drivers per string, parallelCount strings in parallel:
 *   Ztotal = (Z * seriesCount) / parallelCount
 * The voltage across each individual loudspeaker is the amplifier output voltage
 * divided by seriesCount; strings in parallel each see the full output voltage.
 */

import { SpeakerGroup } from './types';
import { tracked, Tracked, ValueStatus, Certainty } from './status';

export interface LoadResult {
  /** Total impedance presented to the amplifier channel. */
  totalImpedance: Tracked;
  /** Fraction of amplifier output voltage appearing across one loudspeaker. */
  voltageDivider: number;
  /** Total number of loudspeakers on the channel. */
  count: number;
  notes: string[];
}

export function normalizeGroup(group: SpeakerGroup): { series: number; parallel: number } {
  const series = Math.max(1, Math.round(group.seriesCount || 1));
  const parallel = Math.max(1, Math.round(group.parallelCount || 1));
  switch (group.connection) {
    case 'single':
      return { series: 1, parallel: 1 };
    case 'series':
      return { series, parallel: 1 };
    case 'parallel':
      return { series: 1, parallel };
    case 'series-parallel':
      return { series, parallel };
  }
}

export function computeLoad(
  perSpeakerImpedance: number,
  group: SpeakerGroup,
  opts: { impedanceStatus?: ValueStatus; impedanceCertainty?: Certainty; isNominal?: boolean } = {},
): LoadResult {
  const { series, parallel } = normalizeGroup(group);
  const total = (perSpeakerImpedance * series) / parallel;
  const notes: string[] = [];
  if (opts.isNominal !== false) {
    notes.push(
      'Total load is computed from NOMINAL impedance. The real load varies with frequency; ' +
        'check the minimum impedance of the combination against the amplifier load limit.',
    );
  }
  if (series > 1) {
    notes.push(
      `Series connection: each loudspeaker sees 1/${series} of the amplifier output voltage. ` +
        'Driver-to-driver impedance differences unbalance this split in the real world.',
    );
  }
  if (parallel > 1) {
    notes.push(
      `${parallel} parallel strings: every string sees the full amplifier output voltage, and ` +
        'the amplifier must supply the combined current.',
    );
  }
  return {
    totalImpedance: tracked(total, 'ohm', 'impedance', 'calculated', opts.impedanceCertainty ?? 'medium', {
      formula: `Ztotal = (Z * seriesCount) / parallelCount = (${perSpeakerImpedance} * ${series}) / ${parallel}`,
      sources: ['Nominal impedance', 'Connection configuration'],
      notes,
    }),
    voltageDivider: 1 / series,
    count: series * parallel,
    notes,
  };
}

/**
 * Amplifier output voltage allowed by a per-loudspeaker voltage limit.
 * In series, the amplifier may swing seriesCount times the per-driver limit.
 */
export function amplifierVoltageForSpeakerLimit(speakerLimitV: number, group: SpeakerGroup): number {
  const { series } = normalizeGroup(group);
  return speakerLimitV * series;
}

/** Voltage across one loudspeaker for a given amplifier output voltage. */
export function speakerVoltageFromAmplifier(amplifierV: number, group: SpeakerGroup): number {
  const { series } = normalizeGroup(group);
  return amplifierV / series;
}
