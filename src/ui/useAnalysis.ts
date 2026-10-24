/** Resolves the active channel's equipment and runs the engine. */

import { useMemo } from 'react';
import { ChannelAnalysis, analyzeChannel, ChannelConfig, Project } from '../engine';
import { useStore } from '../state/store';

export function analyzeFor(project: Project | null, channel: ChannelConfig | null): ChannelAnalysis | null {
  if (!project || !channel) return null;
  const loudspeaker = project.loudspeakers.find((l) => l.id === channel.loudspeakerId) ?? null;
  const amplifier = project.amplifiers.find((a) => a.id === channel.amplifierId) ?? null;
  const dsp = project.dsps.find((d) => d.id === channel.dspId) ?? null;
  // A measured chain gain, when one was saved, overrides the published figure.
  const lastMeasured = [...channel.measurements]
    .reverse()
    .find((m) => m.measuredVrms !== null && m.dspOutputLevel !== null);
  const measuredGainDb =
    lastMeasured && lastMeasured.measuredVrms !== null && lastMeasured.dspOutputScale === 'dBu'
      ? 20 * Math.log10(lastMeasured.measuredVrms / 0.775) - (lastMeasured.dspOutputLevel as number)
      : null;
  return analyzeChannel({ channel, loudspeaker, amplifier, dsp, measuredGainDb });
}

export function useAnalysis(): ChannelAnalysis | null {
  const { project, channel } = useStore();
  return useMemo(() => analyzeFor(project, channel), [project, channel]);
}
