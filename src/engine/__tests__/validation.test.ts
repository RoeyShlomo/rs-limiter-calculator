/**
 * RS Limiter Calculator — specification validation tests (Tests 1-11).
 * RS - Roey Shlomo.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeChannel,
  conventionOffsetDb,
  dbuToVrms,
  dbvToVrms,
  inputVrmsForOutput,
  isKnown,
  newAmplifier,
  newChannel,
  newDsp,
  newLimiterStage,
  newLoudspeaker,
  powerFromVrms,
  ratingForLoad,
  sensitivityToVrms,
  spec,
  vrmsFromPower,
  vrmsToDbu,
  vrmsToDbv,
  vrmsToVpeak,
  vpeakToVrms,
  voltageGainDb,
  computeLoad,
  SINE_CREST_FACTOR_DB,
  Amplifier,
  DspDevice,
  Loudspeaker,
  ChannelConfig,
  DbfsConvention,
} from '../index';

// ---------------------------------------------------------------------------
// Shared fixtures: 100 W AES into 8 ohm, amplifier gain 32 dB, DSP +18 dBu at FS
// ---------------------------------------------------------------------------

function speaker100W8Ohm(extra: Partial<Loudspeaker> = {}): Loudspeaker {
  return newLoudspeaker({
    manufacturer: 'Generic',
    model: '8 ohm 100 W AES',
    nominalImpedance: spec(8, 'ohm'),
    aesPower: spec(100, 'W'),
    ...extra,
  });
}

function amp32dB(extra: Partial<Amplifier> = {}): Amplifier {
  return newAmplifier({
    manufacturer: 'Generic',
    model: 'Gain 32 dB',
    voltageGainDb: spec(32, 'dB'),
    ratings: [{ impedanceOhm: 8, powerW: 2000, status: 'manufacturer' }],
    gainControlPosition: 'Fully clockwise',
    internalLimiter: 'none',
    minimumLoadOhm: spec(2, 'ohm'),
    ...extra,
  });
}

function dspAt18dBu(convention: DbfsConvention, extra: Partial<DspDevice> = {}): DspDevice {
  return newDsp({
    manufacturer: 'Generic',
    model: 'Calibrated DSP',
    dbfsConvention: convention,
    analogFullScaleDbu: spec(18, 'dBu'),
    limiters: [
      newLimiterStage({ type: 'rms', protects: 'thermal', thresholdScale: 'dBFS', detectionMode: 'rms' }),
      newLimiterStage({ type: 'peak', protects: 'peak', thresholdScale: 'dBFS', peakThresholdReference: 'peak' }),
    ],
    ...extra,
  });
}

function channelNoMargin(extra: Partial<ChannelConfig> = {}): ChannelConfig {
  return newChannel({
    name: 'Test channel',
    margins: { thermalDb: 0, peakDb: 0, clipDb: 0 },
    ...extra,
  });
}

function analyze(opts: {
  loudspeaker?: Loudspeaker | null;
  amplifier?: Amplifier | null;
  dsp?: DspDevice | null;
  channel?: ChannelConfig;
}) {
  const loudspeaker = opts.loudspeaker === undefined ? speaker100W8Ohm() : opts.loudspeaker;
  const amplifier = opts.amplifier === undefined ? amp32dB() : opts.amplifier;
  const dsp = opts.dsp === undefined ? dspAt18dBu('aes17') : opts.dsp;
  const channel = opts.channel ?? channelNoMargin();
  return analyzeChannel({ channel, loudspeaker, amplifier, dsp });
}

// ---------------------------------------------------------------------------

describe('Test 1 — 100 W into 8 ohm', () => {
  it('gives Vrms = 28.284 V and about +31.245 dBu', () => {
    const v = vrmsFromPower(100, 8);
    expect(v).toBeCloseTo(28.284, 3);
    expect(vrmsToDbu(v)).toBeCloseTo(31.245, 2);
  });

  it('reaches the same figure through the channel engine', () => {
    const r = analyze({});
    const limit = r.domains.thermal.limitAtAmplifier;
    expect(isKnown(limit)).toBe(true);
    expect(limit.value).toBeCloseTo(28.284, 3);
    expect(r.domains.thermal.targetLevelDbu.value).toBeCloseTo(31.245, 2);
  });

  it('labels the power-derived figure as an equivalent, not true power', () => {
    const r = analyze({});
    const notes = (r.domains.thermal.limitAtAmplifier.notes ?? []).join(' ');
    expect(notes).toMatch(/nominal impedance/i);
    expect(notes).toMatch(/equivalent/i);
  });

  it('reverses exactly: P = Vrms^2 / R', () => {
    expect(powerFromVrms(vrmsFromPower(100, 8), 8)).toBeCloseTo(100, 9);
  });
});

describe('Test 2 — amplifier voltage gain 32 dB', () => {
  it('requires about -0.755 dBu out of the DSP', () => {
    const r = analyze({});
    const req = r.domains.thermal.requiredDspOutputDbu;
    expect(isKnown(req)).toBe(true);
    expect(req.value).toBeCloseTo(-0.755, 2);
  });

  it('states the formula it used', () => {
    const r = analyze({});
    expect(r.domains.thermal.requiredDspOutputDbu.formula).toMatch(
      /Required DSP Output Level \(dBu\) = Target Amplifier Output Level \(dBu\) - Amplifier Voltage Gain/,
    );
  });

  it('never treats the amplifier output level as the DSP output level', () => {
    const r = analyze({});
    const amplifierLevel = r.domains.thermal.targetLevelDbu.value as number;
    const dspLevel = r.domains.thermal.requiredDspOutputDbu.value as number;
    expect(amplifierLevel - dspLevel).toBeCloseTo(32, 6);
  });
});

describe('Test 3 — AES17, full-scale sine = +18 dBu', () => {
  it('gives a threshold of about -18.755 dBFS', () => {
    const r = analyze({});
    const t = r.domains.thermal.threshold;
    expect(t.unit).toBe('dBFS');
    expect(isKnown(t)).toBe(true);
    expect(t.value).toBeCloseTo(-18.755, 2);
  });

  it('records the convention with the result', () => {
    const r = analyze({});
    expect((r.domains.thermal.threshold.notes ?? []).join(' ')).toMatch(/AES17/);
  });
});

describe('Test 4 — no DSP calibration data', () => {
  it('produces no definitive dBFS threshold', () => {
    const dsp = dspAt18dBu('unknown', { analogFullScaleDbu: { value: null, unit: 'dBu', status: 'unknown' } });
    const r = analyze({ dsp });
    expect(isKnown(r.domains.thermal.threshold)).toBe(false);
    expect(r.domains.thermal.threshold.status).toBe('unknown');
  });

  it('lists the missing data and points to field calibration', () => {
    const dsp = dspAt18dBu('unknown', { analogFullScaleDbu: { value: null, unit: 'dBu', status: 'unknown' } });
    const r = analyze({ dsp });
    const fields = r.missing.map((m) => m.field);
    expect(fields).toContain('dBFS convention');
    expect(fields).toContain('Analog full-scale reference (dBu)');
    expect(r.missing.some((m) => m.remedy === 'field-calibration' || m.remedy === 'choose-convention')).toBe(true);
  });

  it('still reports the amplifier-side target, which needs no DSP reference', () => {
    const dsp = dspAt18dBu('unknown', { analogFullScaleDbu: { value: null, unit: 'dBu', status: 'unknown' } });
    const r = analyze({ dsp });
    expect(r.domains.thermal.requiredDspOutputDbu.value).toBeCloseTo(-0.755, 2);
  });
});

describe('Test 5 — only nominal impedance and an AES rating', () => {
  const r = analyze({});

  it('never presents a mechanically safe peak threshold', () => {
    const peak = r.domains.peak;
    // The only peak candidate is the amplifier, which is not loudspeaker protection.
    expect(peak.governedBy).not.toBe('loudspeaker');
    expect(peak.fieldVerified).toBe(false);
  });

  it('refuses to derive a loudspeaker peak voltage limit', () => {
    expect(isKnown(r.speaker!.peakPerSpeaker)).toBe(false);
    expect((r.speaker!.peakPerSpeaker.notes ?? []).join(' ')).toMatch(/AES/);
  });

  it('reports the missing peak data', () => {
    expect(r.missing.some((m) => m.blocks.includes('peak'))).toBe(true);
  });

  it('warns that a peak limiter alone is not complete protection', () => {
    const noPeak = analyze({
      dsp: dspAt18dBu('aes17', {
        limiters: [newLimiterStage({ type: 'peak', protects: 'peak', thresholdScale: 'dBFS' })],
      }),
    });
    expect(noPeak.warnings.join(' ')).toMatch(/peak limiter alone does NOT provide complete/i);
  });
});

describe('Test 6 — scale conversions with RMS and peak kept separate', () => {
  it('converts dBu, dBV and Vrms consistently', () => {
    expect(vrmsToDbu(0.775)).toBeCloseTo(0, 9);
    expect(vrmsToDbv(1)).toBeCloseTo(0, 9);
    expect(dbuToVrms(0)).toBeCloseTo(0.775, 9);
    expect(dbvToVrms(0)).toBeCloseTo(1, 9);
    // 20*log10(0.775) = -2.2140 dB with the 0.775 reference fixed by the specification.
    // (The textbook 2.2185 dB figure assumes the 0.7745967 reference.)
    expect(vrmsToDbv(0.775)).toBeCloseTo(-2.214, 3);
    expect(vrmsToDbu(1)).toBeCloseTo(2.214, 3);
  });

  it('round-trips 28.284 Vrms through every RMS scale', () => {
    const v = vrmsFromPower(100, 8);
    expect(dbuToVrms(vrmsToDbu(v))).toBeCloseTo(v, 9);
    expect(dbvToVrms(vrmsToDbv(v))).toBeCloseTo(v, 9);
  });

  it('crosses into the peak domain only with an explicit crest factor', () => {
    const v = vrmsFromPower(100, 8);
    expect(SINE_CREST_FACTOR_DB).toBeCloseTo(3.0103, 4);
    const vpeak = vrmsToVpeak(v, SINE_CREST_FACTOR_DB);
    expect(vpeak).toBeCloseTo(40.0, 2);
    expect(vpeakToVrms(vpeak, SINE_CREST_FACTOR_DB)).toBeCloseTo(v, 9);
    // A 12 dB crest factor signal of the same RMS has a much higher peak.
    expect(vrmsToVpeak(v, 12)).toBeCloseTo(112.59, 1);
  });

  it('keeps unit and domain labels on every engine value', () => {
    const r = analyze({});
    expect(r.domains.thermal.limitAtAmplifier.unit).toBe('Vrms');
    expect(r.domains.thermal.limitAtAmplifier.domain).toBe('rms');
    expect(r.domains.thermal.targetLevelDbu.unit).toBe('dBu');
  });
});

describe('Test 7 — series and parallel connections', () => {
  it('computes the total load for two 8 ohm cabinets in parallel', () => {
    const load = computeLoad(8, { connection: 'parallel', seriesCount: 1, parallelCount: 2 });
    expect(load.totalImpedance.value).toBeCloseTo(4, 9);
    expect(load.count).toBe(2);
    expect(load.voltageDivider).toBeCloseTo(1, 9);
  });

  it('computes the total load for two 8 ohm cabinets in series', () => {
    const load = computeLoad(8, { connection: 'series', seriesCount: 2, parallelCount: 1 });
    expect(load.totalImpedance.value).toBeCloseTo(16, 9);
    expect(load.voltageDivider).toBeCloseTo(0.5, 9);
  });

  it('computes a 2 series x 2 parallel array', () => {
    const load = computeLoad(8, { connection: 'series-parallel', seriesCount: 2, parallelCount: 2 });
    expect(load.totalImpedance.value).toBeCloseTo(8, 9);
    expect(load.count).toBe(4);
  });

  it('keeps per-loudspeaker loading correct in parallel: each cabinet sees the full voltage', () => {
    const ch = channelNoMargin({ group: { connection: 'parallel', seriesCount: 1, parallelCount: 2 } });
    const r = analyze({ channel: ch });
    // Per-speaker limit unchanged, amplifier limit unchanged, total load halved.
    expect(r.speaker!.rmsPerSpeaker.value).toBeCloseTo(28.284, 3);
    expect(r.domains.thermal.limitAtAmplifier.value).toBeCloseTo(28.284, 3);
    expect(r.totalLoadOhm).toBeCloseTo(4, 9);
    // Equivalent power at the amplifier doubles: two cabinets at 100 W each.
    expect(r.domains.thermal.equivalentPower.value).toBeCloseTo(200, 2);
  });

  it('doubles the allowed amplifier voltage for two cabinets in series', () => {
    const ch = channelNoMargin({ group: { connection: 'series', seriesCount: 2, parallelCount: 1 } });
    const r = analyze({ channel: ch });
    expect(r.speaker!.rmsPerSpeaker.value).toBeCloseTo(28.284, 3);
    expect(r.domains.thermal.limitAtAmplifier.value).toBeCloseTo(56.569, 3);
    expect(r.totalLoadOhm).toBeCloseTo(16, 9);
    // Still 100 W per cabinet, 200 W total equivalent.
    expect(r.domains.thermal.equivalentPower.value).toBeCloseTo(200, 2);
  });

  it('flags a load below the amplifier minimum', () => {
    const ch = channelNoMargin({ group: { connection: 'parallel', seriesCount: 1, parallelCount: 8 } });
    const r = analyze({ channel: ch, amplifier: amp32dB({ minimumLoadOhm: spec(2, 'ohm') }) });
    expect(r.totalLoadOhm).toBeCloseTo(1, 9);
    expect(r.warnings.join(' ')).toMatch(/LOAD VIOLATION/);
  });
});

describe('Test 8 — a post-limiter gain change invalidates the threshold', () => {
  function withPostGain(gainDb: number): ChannelConfig {
    const ch = channelNoMargin();
    return {
      ...ch,
      chain: ch.chain.map((s) =>
        s.id === 'dsp-out' ? { ...s, gainDb: { value: gainDb, unit: 'dB' as const, status: 'manufacturer' as const } } : s,
      ),
    };
  }

  it('shifts the threshold by exactly the post-limiter gain', () => {
    const base = analyze({ channel: withPostGain(0) });
    const plus6 = analyze({ channel: withPostGain(6) });
    expect(base.domains.thermal.threshold.value).toBeCloseTo(-18.755, 2);
    expect(plus6.domains.thermal.threshold.value).toBeCloseTo(-24.755, 2);
    expect(
      (base.domains.thermal.threshold.value as number) - (plus6.domains.thermal.threshold.value as number),
    ).toBeCloseTo(6, 6);
  });

  it('leaves the required DSP OUTPUT level unchanged — only the limiter node moves', () => {
    const plus6 = analyze({ channel: withPostGain(6) });
    expect(plus6.domains.thermal.requiredDspOutputDbu.value).toBeCloseTo(-0.755, 2);
    expect(plus6.domains.thermal.thresholdAtLimiterDbu.value).toBeCloseTo(-6.755, 2);
  });

  it('warns explicitly that the threshold is invalidated by such a change', () => {
    const plus6 = analyze({ channel: withPostGain(6) });
    expect(plus6.warnings.join(' ')).toMatch(/INVALIDATES the threshold/);
  });

  it('does not move the threshold for a PRE-limiter gain change', () => {
    const ch = channelNoMargin();
    const preChanged: ChannelConfig = {
      ...ch,
      chain: ch.chain.map((s) =>
        s.id === 'dsp-in' ? { ...s, gainDb: { value: 6, unit: 'dB' as const, status: 'manufacturer' as const } } : s,
      ),
    };
    expect(analyze({ channel: preChanged }).domains.thermal.threshold.value).toBeCloseTo(-18.755, 2);
  });
});

describe('Test 9 — the same data under the peak-referenced convention', () => {
  it('differs from the AES17 result by 3.01 dB', () => {
    const aes = analyze({ dsp: dspAt18dBu('aes17') });
    const pk = analyze({ dsp: dspAt18dBu('peak-referenced') });
    expect(aes.domains.thermal.threshold.value).toBeCloseTo(-18.755, 2);
    expect(pk.domains.thermal.threshold.value).toBeCloseTo(-21.766, 2);
    expect(
      (aes.domains.thermal.threshold.value as number) - (pk.domains.thermal.threshold.value as number),
    ).toBeCloseTo(3.0103, 3);
  });

  it('labels each result with its own convention', () => {
    const pk = analyze({ dsp: dspAt18dBu('peak-referenced') });
    expect((pk.domains.thermal.threshold.notes ?? []).join(' ')).toMatch(/Peak-referenced/i);
  });

  it('uses the defined offsets', () => {
    expect(conventionOffsetDb('aes17')).toBe(0);
    expect(conventionOffsetDb('peak-referenced')).toBeCloseTo(-3.0103, 4);
    expect(conventionOffsetDb('unknown')).toBeNull();
  });
});

describe('Test 10 — 1000 W into 8 ohm, input sensitivity 1.4 Vrms', () => {
  const amp = newAmplifier({
    ratings: [{ impedanceOhm: 8, powerW: 1000, status: 'manufacturer' }],
    inputSensitivity: spec(1.4, 'Vrms'),
    sensitivityUnit: 'Vrms',
    sensitivityLoadOhm: spec(8, 'ohm'),
    gainControlPosition: 'Fully clockwise',
    internalLimiter: 'none',
  });

  it('gives Vout = 89.443 Vrms', () => {
    const rating = ratingForLoad(amp, 8)!;
    expect(vrmsFromPower(rating.powerW, rating.impedanceOhm)).toBeCloseTo(89.443, 3);
  });

  it('gives a voltage gain of about 36.11 dB', () => {
    const vout = vrmsFromPower(1000, 8);
    expect(voltageGainDb(vout, sensitivityToVrms(1.4, 'Vrms'))).toBeCloseTo(36.11, 2);
  });

  it('derives the same gain through the amplifier analyser', () => {
    const r = analyzeChannel({
      channel: channelNoMargin(),
      loudspeaker: speaker100W8Ohm(),
      amplifier: amp,
      dsp: dspAt18dBu('aes17'),
    });
    expect(r.amp!.gainDb.value).toBeCloseTo(36.11, 2);
    expect(r.amp!.maxOutputVrms.value).toBeCloseTo(89.443, 3);
  });

  it('reverses: the gain returns the 1.4 Vrms sensitivity', () => {
    const vout = vrmsFromPower(1000, 8);
    const gain = voltageGainDb(vout, 1.4);
    expect(inputVrmsForOutput(vout, gain)).toBeCloseTo(1.4, 9);
  });

  it('converts a sensitivity given in dBu or dBV to the same gain', () => {
    const vout = vrmsFromPower(1000, 8);
    const gain = voltageGainDb(vout, 1.4);
    const sensDbu = vrmsToDbu(1.4);
    const sensDbv = vrmsToDbv(1.4);
    expect(voltageGainDb(vout, sensitivityToVrms(sensDbu, 'dBu'))).toBeCloseTo(gain, 9);
    expect(voltageGainDb(vout, sensitivityToVrms(sensDbv, 'dBV'))).toBeCloseTo(gain, 9);
  });
});

describe('Test 11 — a -3 dB safety margin on Test 1', () => {
  const r = analyze({ channel: newChannel({ margins: { thermalDb: -3, peakDb: -3, clipDb: -3 } }) });
  const t = r.domains.thermal;

  it('gives about 20.0 Vrms', () => {
    expect(t.targetAtAmplifier.value).toBeCloseTo(20.0, 1);
  });

  it('gives about 50 W equivalent', () => {
    expect(t.equivalentPower.value).toBeCloseTo(50, 0);
  });

  it('gives about +28.23 dBu', () => {
    expect(t.targetLevelDbu.value).toBeCloseTo(28.24, 1);
  });

  it('labels the margin as a starting point, not a guarantee', () => {
    const notes = (t.targetAtAmplifier.notes ?? []).join(' ');
    expect(notes).toMatch(/not a protection guarantee/i);
    expect(notes).toMatch(/starting point/i);
  });

  it('shifts the dBFS threshold by the same 3 dB', () => {
    expect(t.threshold.value).toBeCloseTo(-21.755, 2);
  });

  it('keeps the equivalent power labelled as equivalent', () => {
    expect((t.equivalentPower.notes ?? []).join(' ')).toMatch(/EQUIVALENT power, not true electrical power/);
  });
});
