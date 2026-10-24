/**
 * RS Limiter Calculator — signal chain gain accounting.
 *
 * Gains BEFORE the limiter do not move the threshold: the threshold is defined at
 * the limiter detector input. Gains AFTER the limiter do move it, and a change to
 * any of them invalidates a previously calculated threshold.
 */

import { ChainStage } from './types';
import { Tracked, tracked, derivedStatus, worstCertainty } from './status';

export interface ChainGains {
  preLimiterDb: Tracked;
  postLimiterDb: Tracked;
  /** Stages with an unknown gain value, which make the accounting incomplete. */
  undefinedStages: string[];
  warnings: string[];
}

export function chainGains(stages: ChainStage[]): ChainGains {
  const enabled = stages.filter((s) => s.enabled && s.kind !== 'amplifier' && s.kind !== 'loudspeaker');
  const undefinedStages: string[] = [];
  const warnings: string[] = [];

  const sum = (pos: ChainStage['position']) => {
    let total = 0;
    const statuses: ChainStage['gainDb']['status'][] = [];
    const parts: string[] = [];
    for (const s of enabled.filter((x) => x.position === pos)) {
      if (s.gainDb.value === null || !Number.isFinite(s.gainDb.value)) {
        undefinedStages.push(s.label);
        continue;
      }
      total += s.gainDb.value;
      statuses.push(s.gainDb.status);
      parts.push(`${s.label}: ${s.gainDb.value >= 0 ? '+' : ''}${s.gainDb.value} dB`);
    }
    return { total, statuses, parts };
  };

  const pre = sum('pre-limiter');
  const post = sum('post-limiter');

  if (post.total !== 0) {
    warnings.push(
      `There is ${post.total > 0 ? 'gain' : 'attenuation'} of ${post.total.toFixed(2)} dB after the ` +
        'limiter. The threshold shown already accounts for it. Changing any post-limiter gain ' +
        'INVALIDATES the threshold and the calibration must be recalculated.',
    );
  }
  if (undefinedStages.length) {
    warnings.push(
      `Gain is undefined for: ${undefinedStages.join(', ')}. The gain structure is incomplete, so the ` +
        'threshold cannot be treated as verified.',
    );
  }

  return {
    preLimiterDb: tracked(pre.total, 'dB', 'ratio', derivedStatus(...pre.statuses), worstCertainty('high'), {
      formula: pre.parts.length ? `Sum of pre-limiter stages: ${pre.parts.join(' , ')}` : 'No pre-limiter gain stages.',
      sources: ['Signal chain'],
      notes: [
        'Pre-limiter gain changes how much the limiter engages, but does not change the threshold value ' +
          'required to protect the loudspeaker.',
      ],
    }),
    postLimiterDb: tracked(post.total, 'dB', 'ratio', derivedStatus(...post.statuses), worstCertainty('high'), {
      formula: post.parts.length
        ? `Sum of post-limiter stages: ${post.parts.join(' , ')}`
        : 'No post-limiter gain stages.',
      sources: ['Signal chain'],
      notes: [
        'Post-limiter gain is subtracted from the required output level to place the threshold correctly.',
      ],
    }),
    undefinedStages,
    warnings,
  };
}

export function defaultChain(): ChainStage[] {
  const mk = (
    id: string,
    kind: ChainStage['kind'],
    label: string,
    position: ChainStage['position'],
    gain: number | null,
  ): ChainStage => ({
    id,
    kind,
    label,
    gainDb: { value: gain, unit: 'dB', status: gain === null ? 'unknown' : 'manufacturer' },
    position,
    enabled: true,
  });
  return [
    mk('src', 'source', 'Source / console output', 'pre-limiter', 0),
    mk('dsp-in', 'dsp', 'DSP input gain', 'pre-limiter', 0),
    mk('xover', 'crossover', 'Crossover / band gain', 'pre-limiter', 0),
    mk('lim', 'limiter', 'Limiter', 'pre-limiter', 0),
    mk('dsp-out', 'gain', 'DSP output gain / trim', 'post-limiter', 0),
    mk('amp', 'amplifier', 'Amplifier', 'post-limiter', null),
    mk('spk', 'loudspeaker', 'Loudspeaker', 'post-limiter', null),
  ];
}
