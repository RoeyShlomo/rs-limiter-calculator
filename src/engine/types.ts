/** RS Limiter Calculator — equipment and project data model. */

import { ValueStatus, Unit } from './status';

/** A user-entered number with its unit and provenance. */
export interface Entry {
  value: number | null;
  unit?: Unit;
  status: ValueStatus;
  /** Free text: catalogue page, measurement conditions, etc. */
  note?: string;
}

export const emptyEntry = (unit?: Unit): Entry => ({ value: null, unit, status: 'unknown' });

export const spec = (value: number, unit?: Unit, note?: string): Entry => ({
  value,
  unit,
  status: 'manufacturer',
  note,
});

export const measured = (value: number, unit?: Unit, note?: string): Entry => ({
  value,
  unit,
  status: 'measured',
  note,
});

// ---------------------------------------------------------------------------
// Loudspeaker
// ---------------------------------------------------------------------------

/** How a manufacturer's "Peak Power" figure should be read. Never guessed silently. */
export type PeakPowerInterpretation =
  /** Vpeak = sqrt(Ppeak * Znom) — the power the peak voltage would dissipate. */
  | 'peak-voltage'
  /** Vrms = sqrt(Ppeak * Znom) — a short-burst RMS rating. */
  | 'rms-equivalent'
  | 'unknown';

export type SpeakerConnection = 'single' | 'parallel' | 'series' | 'series-parallel';

export interface Loudspeaker {
  id: string;
  manufacturer: string;
  model: string;
  /** Nominal impedance per driver / cabinet. */
  nominalImpedance: Entry;
  /** Minimum impedance from the published impedance curve, when known. */
  minimumImpedance: Entry;
  aesPower: Entry;
  continuousPower: Entry;
  programPower: Entry;
  peakPower: Entry;
  peakPowerInterpretation: PeakPowerInterpretation;
  /** Published voltage limits take priority over any power-derived figure. */
  publishedRmsVoltage: Entry;
  publishedPeakVoltage: Entry;
  /** Recommended pass band. */
  freqRangeLowHz: Entry;
  freqRangeHighHz: Entry;
  /** High-pass / lower cutoff the limiter settings assume. */
  lowerCutoffHz: Entry;
  xmaxMm: Entry;
  /** Manufacturer statement of a mechanical/excursion limit, free text. */
  mechanicalNotes: string;
  /** Band this cabinet or driver section covers. */
  band: 'sub' | 'low' | 'mid' | 'high' | 'full';
}

export interface SpeakerGroup {
  connection: SpeakerConnection;
  /** Drivers in each series string. */
  seriesCount: number;
  /** Number of such strings in parallel. */
  parallelCount: number;
}

// ---------------------------------------------------------------------------
// Amplifier
// ---------------------------------------------------------------------------

export type AmpMode = 'stereo' | 'bridge' | 'parallel';

export interface AmpPowerRating {
  impedanceOhm: number;
  powerW: number;
  status: ValueStatus;
}

export type SensitivityUnit = 'Vrms' | 'dBu' | 'dBV';

export interface Amplifier {
  id: string;
  manufacturer: string;
  model: string;
  ratings: AmpPowerRating[];
  /** Voltage gain in dB, when published. */
  voltageGainDb: Entry;
  /** Input sensitivity for rated output, in the chosen unit. */
  inputSensitivity: Entry;
  sensitivityUnit: SensitivityUnit;
  /** Load the sensitivity / rated power figure refers to. */
  sensitivityLoadOhm: Entry;
  maxInputLevel: Entry;
  maxInputLevelUnit: SensitivityUnit;
  /** Published maximum output voltage, when known. */
  maxOutputVoltage: Entry;
  maxOutputVoltageIsPeak: boolean;
  mode: AmpMode;
  minimumLoadOhm: Entry;
  /** Attenuator / gain control position during calibration. */
  gainControlPosition: string;
  /** Does the amplifier apply its own limiter during calibration? */
  internalLimiter: 'none' | 'active' | 'unknown';
  internalLimiterNotes: string;
}

// ---------------------------------------------------------------------------
// DSP
// ---------------------------------------------------------------------------

export type DbfsConvention = 'aes17' | 'peak-referenced' | 'unknown';

export type LimiterType = 'rms' | 'peak' | 'clip' | 'compressor' | 'single-unspecified';

export type ThresholdScale =
  | 'dBu'
  | 'dBV'
  | 'dBFS'
  | 'dB-relative'
  | 'Vrms'
  | 'Vpeak'
  | 'W'
  | 'manufacturer-defined';

export type DetectionMode = 'rms' | 'peak' | 'hybrid' | 'unknown';

export interface LimiterStage {
  id: string;
  type: LimiterType;
  /** Which protection domain the user intends this limiter to serve. */
  protects: 'thermal' | 'peak' | 'clip';
  thresholdScale: ThresholdScale;
  /**
   * For a peak limiter: is the displayed threshold referenced to peak voltage,
   * or to the RMS of a sine at that peak? Never assumed.
   */
  peakThresholdReference: 'peak' | 'rms-of-sine' | 'unknown';
  attackMs: Entry;
  releaseMs: Entry;
  holdMs: Entry;
  ratio: Entry;
  kneeDb: Entry;
  lookaheadMs: Entry;
  detectionMode: DetectionMode;
  rmsIntegrationMs: Entry;
  /** Manufacturer-recommended settings, entered verbatim. */
  manufacturerRecommendation: string;
}

export interface DspDevice {
  id: string;
  manufacturer: string;
  model: string;
  dbfsConvention: DbfsConvention;
  /** RMS level in dBu of a full-scale sine at the DSP analog output. */
  analogFullScaleDbu: Entry;
  /** Reference level for a 'dB-relative' scale, in dBu. */
  relativeReferenceDbu: Entry;
  limiters: LimiterStage[];
}

// ---------------------------------------------------------------------------
// Signal chain
// ---------------------------------------------------------------------------

export type StageKind =
  | 'source'
  | 'dsp'
  | 'gain'
  | 'limiter'
  | 'amplifier'
  | 'crossover'
  | 'loudspeaker';

export interface ChainStage {
  id: string;
  kind: StageKind;
  label: string;
  /** Gain (positive) or attenuation (negative) in dB contributed by this stage. */
  gainDb: Entry;
  /** Stages after the limiter invalidate a previously computed threshold. */
  position: 'pre-limiter' | 'post-limiter';
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Protection domains and margins
// ---------------------------------------------------------------------------

export type ProtectionDomain = 'thermal' | 'peak' | 'clip';

export interface SafetyMargins {
  /** All negative numbers, in dB. Starting value -3 dB in each domain. */
  thermalDb: number;
  peakDb: number;
  clipDb: number;
}

export const DEFAULT_MARGINS: SafetyMargins = { thermalDb: -3, peakDb: -3, clipDb: -3 };

// ---------------------------------------------------------------------------
// Measurements (field calibration)
// ---------------------------------------------------------------------------

export interface Measurement {
  id: string;
  timestamp: string;
  /** Test signal used. */
  signal: string;
  /** Crest factor of the test signal in dB. */
  crestFactorDb: number | null;
  /** Level sent out of the DSP during the measurement. */
  dspOutputLevel: number | null;
  dspOutputScale: ThresholdScale;
  /** Voltage read at the amplifier output. */
  measuredVrms: number | null;
  measuredVpeak: number | null;
  /** Meter used, and whether it is valid for the signal. */
  instrument: string;
  instrumentTrueRms: boolean;
  loadOhm: number | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface ChannelConfig {
  id: string;
  name: string;
  band: 'sub' | 'low' | 'mid' | 'high' | 'full';
  loudspeakerId: string | null;
  group: SpeakerGroup;
  amplifierId: string | null;
  dspId: string | null;
  margins: SafetyMargins;
  /** Crest factor assumed when a peak figure must be expressed in an RMS scale. */
  assumedCrestFactorDb: number | null;
  chain: ChainStage[];
  measurements: Measurement[];
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  venue: string;
  engineer: string;
  createdAt: string;
  updatedAt: string;
  loudspeakers: Loudspeaker[];
  amplifiers: Amplifier[];
  dsps: DspDevice[];
  channels: ChannelConfig[];
  notes: string;
}

export const SCHEMA_VERSION = 1;
