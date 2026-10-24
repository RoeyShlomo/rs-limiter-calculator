/** RS Limiter Calculator — default objects for new equipment and projects. */

import {
  Amplifier,
  ChannelConfig,
  DEFAULT_MARGINS,
  DspDevice,
  LimiterStage,
  Loudspeaker,
  Measurement,
  Project,
  SCHEMA_VERSION,
  emptyEntry,
} from './types';
import { defaultChain } from './chain';

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function newLoudspeaker(partial: Partial<Loudspeaker> = {}): Loudspeaker {
  return {
    id: uid('ls'),
    manufacturer: '',
    model: '',
    nominalImpedance: emptyEntry('ohm'),
    minimumImpedance: emptyEntry('ohm'),
    aesPower: emptyEntry('W'),
    continuousPower: emptyEntry('W'),
    programPower: emptyEntry('W'),
    peakPower: emptyEntry('W'),
    peakPowerInterpretation: 'unknown',
    publishedRmsVoltage: emptyEntry('Vrms'),
    publishedPeakVoltage: emptyEntry('Vpeak'),
    freqRangeLowHz: emptyEntry('Hz'),
    freqRangeHighHz: emptyEntry('Hz'),
    lowerCutoffHz: emptyEntry('Hz'),
    xmaxMm: emptyEntry('mm'),
    mechanicalNotes: '',
    band: 'full',
    ...partial,
  };
}

export function newAmplifier(partial: Partial<Amplifier> = {}): Amplifier {
  return {
    id: uid('amp'),
    manufacturer: '',
    model: '',
    ratings: [],
    voltageGainDb: emptyEntry('dB'),
    inputSensitivity: emptyEntry('Vrms'),
    sensitivityUnit: 'Vrms',
    sensitivityLoadOhm: emptyEntry('ohm'),
    maxInputLevel: emptyEntry('dBu'),
    maxInputLevelUnit: 'dBu',
    maxOutputVoltage: emptyEntry('Vrms'),
    maxOutputVoltageIsPeak: false,
    mode: 'stereo',
    minimumLoadOhm: emptyEntry('ohm'),
    gainControlPosition: '',
    internalLimiter: 'unknown',
    internalLimiterNotes: '',
    ...partial,
  };
}

export function newLimiterStage(partial: Partial<LimiterStage> = {}): LimiterStage {
  return {
    id: uid('lim'),
    type: 'rms',
    protects: 'thermal',
    thresholdScale: 'dBu',
    peakThresholdReference: 'unknown',
    attackMs: emptyEntry('ms'),
    releaseMs: emptyEntry('ms'),
    holdMs: emptyEntry('ms'),
    ratio: emptyEntry('x'),
    kneeDb: emptyEntry('dB'),
    lookaheadMs: emptyEntry('ms'),
    detectionMode: 'unknown',
    rmsIntegrationMs: emptyEntry('ms'),
    manufacturerRecommendation: '',
    ...partial,
  };
}

export function newDsp(partial: Partial<DspDevice> = {}): DspDevice {
  return {
    id: uid('dsp'),
    manufacturer: '',
    model: '',
    dbfsConvention: 'unknown',
    analogFullScaleDbu: emptyEntry('dBu'),
    relativeReferenceDbu: emptyEntry('dBu'),
    limiters: [
      newLimiterStage({ type: 'rms', protects: 'thermal', thresholdScale: 'dBu' }),
      newLimiterStage({ type: 'peak', protects: 'peak', thresholdScale: 'dBu' }),
    ],
    ...partial,
  };
}

export function newMeasurement(partial: Partial<Measurement> = {}): Measurement {
  return {
    id: uid('m'),
    timestamp: new Date().toISOString(),
    signal: 'sine-1k',
    crestFactorDb: null,
    dspOutputLevel: null,
    dspOutputScale: 'dBu',
    measuredVrms: null,
    measuredVpeak: null,
    instrument: '',
    instrumentTrueRms: false,
    loadOhm: null,
    notes: '',
    ...partial,
  };
}

export function newChannel(partial: Partial<ChannelConfig> = {}): ChannelConfig {
  return {
    id: uid('ch'),
    name: 'Channel 1',
    band: 'full',
    loudspeakerId: null,
    group: { connection: 'single', seriesCount: 1, parallelCount: 1 },
    amplifierId: null,
    dspId: null,
    margins: { ...DEFAULT_MARGINS },
    assumedCrestFactorDb: null,
    chain: defaultChain(),
    measurements: [],
    ...partial,
  };
}

export function newProject(partial: Partial<Project> = {}): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('prj'),
    name: 'New project',
    venue: '',
    engineer: '',
    createdAt: now,
    updatedAt: now,
    loudspeakers: [],
    amplifiers: [],
    dsps: [],
    channels: [],
    notes: '',
    ...partial,
  };
}
