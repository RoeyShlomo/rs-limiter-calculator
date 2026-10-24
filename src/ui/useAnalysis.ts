/** Resolves the active channel's equipment and runs the engine. */

import { useMemo } from 'react';
import {
  ChannelAnalysis,
  analyzeChannel,
  calibrateGain,
  dspReference,
  isKnown,
  ChannelConfig,
  Project,
} from '../engine';
import { useStore } from '../state/store';

export function analyzeFor(project: Project | null, channel: ChannelConfig | null): ChannelAnalysis | null {
  if (!project || !channel) return null;
  const loudspeaker = project.loudspeakers.find((l) => l.id === channel.loudspeakerId) ?? null;
  const amplifier = project.amplifiers.find((a) => a.id === channel.amplifierId) ?? null;
  const dsp = project.dsps.find((d) => d.id === channel.dspId) ?? null;
  // A measured chain gain, when one was saved, overrides the published figure.
  // The test level may have been set on any scale, so it is converted through the
  // device reference rather than being assumed to be in dBu.
  const ref = dspReference(dsp);
  const measuredGainDb = [...channel.measurements]
    .reverse()
    .reduce<number | null>((found, m) => {
      if (found !== null) return found;
      const gain = calibrateGain(m, ref).gainDb;
      return isKnown(gain) ? gain.value : null;
    }, null);
  return analyzeChannel({ channel, loudspeaker, amplifier, dsp, measuredGainDb });
}

export function useAnalysis(): ChannelAnalysis | null {
  const { project, channel } = useStore();
  return useMemo(() => analyzeFor(project, channel), [project, channel]);
}
