/**
 * RS Limiter Calculator — engineering-rule tests beyond the numbered validation set.
 */

import { describe, it, expect } from 'vitest';
import {
  analogToDbfs,
  analyzeChannel,
  calibrateDspOutput,
  calibrateGain,
  checkInstrument,
  conventionOffsetDb,
  crestFactorEffect,
  dbfsToAnalogDbu,
  deviation,
  dspReference,
  effectiveLoadPerDevice,
  expectedOutputVrms,
  expressThreshold,
  isKnown,
  measured,
  newAmplifier,
  newChannel,
  newDsp,
  newLimiterStage,
  newLoudspeaker,
  newMeasurement,
  peakThresholdDbfs,
  safeTestLevel,
  safetyWarnings,
  spec,
  timingReference,
  vrmsToDbu,
  vrmsFromPower,
  derivedStatus,
  worstCertainty,
  BRIDGE_GAIN_DB,
  SINE_CREST_FACTOR_DB,
} from '../index';

describe('Rule 2 / 3 — 0 dBFS is not 0 dBu, and DSP output is not amplifier output', () => {
  it('returns no dBFS value at all when the reference is unset', () => {
    const ref = dspReference(newDsp());
    expect(ref.usable).toBe(false);
    expect(analogToDbfs(0, ref)).toBeNull();
    expect(dbfsToAnalogDbu(0, ref)).toBeNull();
  });

  it('maps 0 dBFS to the stated analog level, not to 0 dBu', () => {
    const ref = dspReference(newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu') }));
    expect(dbfsToAnalogDbu(0, ref)).toBeCloseTo(18, 9);
    expect(analogToDbfs(18, ref)).toBeCloseTo(0, 9);
    expect(analogToDbfs(0, ref)).toBeCloseTo(-18, 9);
  });

  it('round-trips through the peak-referenced convention too', () => {
    const ref = dspReference(
      newDsp({ dbfsConvention: 'peak-referenced', analogFullScaleDbu: spec(18, 'dBu') }),
    );
    const dbfs = analogToDbfs(12, ref)!;
    expect(dbfs).toBeCloseTo(12 - 18 - 3.0103, 3);
    expect(dbfsToAnalogDbu(dbfs, ref)).toBeCloseTo(12, 9);
  });
});

describe('Rule 4 — nominal impedance is not a constant resistance', () => {
  it('warns when the minimum impedance is below nominal', () => {
    const r = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({
        nominalImpedance: spec(8, 'ohm'),
        minimumImpedance: spec(5.6, 'ohm'),
        aesPower: spec(400, 'W'),
      }),
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB'), ratings: [{ impedanceOhm: 8, powerW: 1200, status: 'manufacturer' }] }),
      dsp: newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu') }),
    });
    expect(r.warnings.join(' ')).toMatch(/Minimum impedance .* is below nominal/);
  });
});

describe('Rule 5 / 6 — rating types are not interchangeable', () => {
  const base = {
    nominalImpedance: spec(8, 'ohm'),
    aesPower: spec(400, 'W'),
    programPower: spec(800, 'W'),
    peakPower: spec(1600, 'W'),
  };

  it('uses the AES rating for the thermal domain, never the program or peak rating', () => {
    const ls = newLoudspeaker(base);
    const r = analyzeChannel({
      channel: newChannel({ margins: { thermalDb: 0, peakDb: 0, clipDb: 0 } }),
      loudspeaker: ls,
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB'), ratings: [{ impedanceOhm: 8, powerW: 4000, status: 'manufacturer' }] }),
      dsp: newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu') }),
    });
    expect(r.domains.thermal.limitAtAmplifier.value).toBeCloseTo(vrmsFromPower(400, 8), 6);
    expect(r.domains.thermal.limitAtAmplifier.sources).toContain('AES power');
  });

  it('refuses a peak limit from a peak power rating whose meaning was not stated', () => {
    const ls = newLoudspeaker({ ...base, peakPowerInterpretation: 'unknown' });
    const r = analyzeChannel({
      channel: newChannel(),
      loudspeaker: ls,
      amplifier: null,
      dsp: null,
    });
    expect(isKnown(r.speaker!.peakPerSpeaker)).toBe(false);
  });

  it('marks a peak limit from a peak power rating as estimated, never manufacturer-specified', () => {
    const ls = newLoudspeaker({ ...base, peakPowerInterpretation: 'peak-voltage' });
    const r = analyzeChannel({ channel: newChannel(), loudspeaker: ls, amplifier: null, dsp: null });
    const pk = r.speaker!.peakPerSpeaker;
    expect(pk.value).toBeCloseTo(Math.sqrt(1600 * 8), 6);
    expect(pk.status).toBe('estimated');
    expect(pk.certainty).toBe('low');
  });

  it('keeps an rms-equivalent peak power reading in the RMS domain', () => {
    const ls = newLoudspeaker({ ...base, peakPowerInterpretation: 'rms-equivalent' });
    const r = analyzeChannel({ channel: newChannel(), loudspeaker: ls, amplifier: null, dsp: null });
    expect(r.speaker!.peakPerSpeaker.domain).toBe('rms');
    expect(r.domains.peak.warnings.join(' ')).toMatch(/RMS-domain value/);
  });

  it('prefers a published voltage limit over any power-derived figure', () => {
    const ls = newLoudspeaker({ ...base, publishedRmsVoltage: spec(50, 'Vrms') });
    const r = analyzeChannel({ channel: newChannel(), loudspeaker: ls, amplifier: null, dsp: null });
    expect(r.speaker!.rmsPerSpeaker.value).toBe(50);
    expect(r.speaker!.rmsPerSpeaker.certainty).toBe('high');
  });
});

describe('Rule 9 — a peak limiter alone is not complete protection', () => {
  it('warns when no thermal limiter is configured', () => {
    const r = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({ nominalImpedance: spec(8, 'ohm'), aesPower: spec(400, 'W') }),
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB') }),
      dsp: newDsp({ limiters: [newLimiterStage({ type: 'peak', protects: 'peak' })] }),
    });
    expect(r.warnings.join(' ')).toMatch(/peak limiter alone does NOT provide complete/i);
  });

  it('warns when a single limiter has no RMS / peak separation', () => {
    const r = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({ nominalImpedance: spec(8, 'ohm'), aesPower: spec(400, 'W') }),
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB') }),
      dsp: newDsp({ limiters: [newLimiterStage({ type: 'single-unspecified', protects: 'thermal' })] }),
    });
    expect(r.warnings.join(' ')).toMatch(/single limiter with no RMS \/ peak separation/);
  });
});

describe('Peak-domain thresholds', () => {
  const ref = dspReference(newDsp({ dbfsConvention: 'peak-referenced', analogFullScaleDbu: spec(18, 'dBu') }));

  it('reads 0 dBFS for the peak of a full-scale sine under the peak-referenced convention', () => {
    const vpeakFs = 0.775 * Math.pow(10, 18 / 20) * Math.SQRT2;
    expect(peakThresholdDbfs(vpeakFs, ref).value).toBeCloseTo(0, 6);
  });

  it('reads +3.01 dBFS for the same peak under AES17', () => {
    const aes = dspReference(newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu') }));
    const vpeakFs = 0.775 * Math.pow(10, 18 / 20) * Math.SQRT2;
    expect(peakThresholdDbfs(vpeakFs, aes).value).toBeCloseTo(SINE_CREST_FACTOR_DB, 4);
  });

  it('refuses a peak threshold when the device peak reference is unknown', () => {
    const r = analyzeChannel({
      channel: newChannel({ margins: { thermalDb: 0, peakDb: 0, clipDb: 0 } }),
      loudspeaker: newLoudspeaker({
        nominalImpedance: spec(8, 'ohm'),
        aesPower: spec(400, 'W'),
        publishedPeakVoltage: spec(120, 'Vpeak'),
      }),
      amplifier: newAmplifier({
        voltageGainDb: spec(32, 'dB'),
        ratings: [{ impedanceOhm: 8, powerW: 4000, status: 'manufacturer' }],
      }),
      dsp: newDsp({
        dbfsConvention: 'aes17',
        analogFullScaleDbu: spec(18, 'dBu'),
        limiters: [newLimiterStage({ type: 'peak', protects: 'peak', thresholdScale: 'dBFS', peakThresholdReference: 'unknown' })],
      }),
    });
    expect(isKnown(r.domains.peak.threshold)).toBe(false);
    expect((r.domains.peak.threshold.notes ?? []).join(' ')).toMatch(/3\.01 dB/);
  });

  it('produces a peak threshold 3.01 dB apart for the two peak references', () => {
    const build = (reference: 'peak' | 'rms-of-sine') =>
      analyzeChannel({
        channel: newChannel({ margins: { thermalDb: 0, peakDb: 0, clipDb: 0 } }),
        loudspeaker: newLoudspeaker({
          nominalImpedance: spec(8, 'ohm'),
          aesPower: spec(400, 'W'),
          publishedPeakVoltage: spec(120, 'Vpeak'),
        }),
        amplifier: newAmplifier({
          voltageGainDb: spec(32, 'dB'),
          maxOutputVoltage: spec(200, 'Vrms'),
        }),
        dsp: newDsp({
          dbfsConvention: 'aes17',
          analogFullScaleDbu: spec(18, 'dBu'),
          limiters: [
            newLimiterStage({ type: 'peak', protects: 'peak', thresholdScale: 'dBu', peakThresholdReference: reference }),
          ],
        }),
      }).domains.peak.threshold.value as number;
    expect(build('peak') - build('rms-of-sine')).toBeCloseTo(SINE_CREST_FACTOR_DB, 4);
  });

  it('takes the most restrictive of the loudspeaker and amplifier peak limits', () => {
    const r = analyzeChannel({
      channel: newChannel({ margins: { thermalDb: 0, peakDb: 0, clipDb: 0 } }),
      loudspeaker: newLoudspeaker({
        nominalImpedance: spec(8, 'ohm'),
        aesPower: spec(400, 'W'),
        publishedPeakVoltage: spec(120, 'Vpeak'),
      }),
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB'), maxOutputVoltage: spec(60, 'Vrms') }),
      dsp: newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu') }),
    });
    // Amplifier sine peak = 60 * sqrt(2) = 84.85 V, below the 120 V loudspeaker limit.
    expect(r.domains.peak.limitAtAmplifier.value).toBeCloseTo(60 * Math.SQRT2, 4);
    expect(r.domains.peak.governedBy).toBe('amplifier');
    expect(r.domains.peak.warnings.join(' ')).toMatch(/not against mechanical damage/);
  });
});

describe('Bridge and parallel amplifier modes', () => {
  it('adds 6.02 dB of voltage gain in bridge mode and warns about grounding', () => {
    const stereo = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({ nominalImpedance: spec(8, 'ohm'), aesPower: spec(400, 'W') }),
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB'), maxOutputVoltage: spec(100, 'Vrms'), mode: 'stereo' }),
      dsp: null,
    });
    const bridged = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({ nominalImpedance: spec(8, 'ohm'), aesPower: spec(400, 'W') }),
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB'), maxOutputVoltage: spec(100, 'Vrms'), mode: 'bridge' }),
      dsp: null,
    });
    expect(BRIDGE_GAIN_DB).toBeCloseTo(6.0206, 4);
    expect((bridged.amp!.gainDb.value as number) - (stereo.amp!.gainDb.value as number)).toBeCloseTo(6.0206, 4);
    expect(bridged.amp!.maxOutputVrms.value).toBeCloseTo(200, 6);
    expect(bridged.warnings.join(' ')).toMatch(/BRIDGE MODE/);
    expect(bridged.warnings.join(' ')).toMatch(/Never reference a meter probe to chassis ground/);
  });

  it('halves the per-device load in bridge mode', () => {
    expect(effectiveLoadPerDevice(8, 'bridge')).toBeCloseTo(4, 9);
    expect(effectiveLoadPerDevice(8, 'parallel')).toBeCloseTo(16, 9);
    expect(effectiveLoadPerDevice(8, 'stereo')).toBeCloseTo(8, 9);
  });

  it('leaves voltage gain unchanged in parallel mode', () => {
    const r = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({ nominalImpedance: spec(4, 'ohm'), aesPower: spec(400, 'W') }),
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB'), mode: 'parallel' }),
      dsp: null,
    });
    expect(r.amp!.gainDb.value).toBeCloseTo(32, 9);
    expect(r.warnings.join(' ')).toMatch(/PARALLEL MODE/);
  });

  it('refuses to convert a published PEAK maximum output voltage into RMS by itself', () => {
    const r = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({ nominalImpedance: spec(8, 'ohm'), aesPower: spec(400, 'W') }),
      amplifier: newAmplifier({
        voltageGainDb: spec(32, 'dB'),
        maxOutputVoltage: spec(150, 'Vpeak'),
        maxOutputVoltageIsPeak: true,
      }),
      dsp: null,
    });
    expect(isKnown(r.amp!.maxOutputVrms)).toBe(false);
    expect(r.amp!.maxOutputVpeak.value).toBeCloseTo(150, 9);
  });
});

describe('Rule 10 / 12 — no safety-critical output without data, no false verification', () => {
  it('blocks every domain when nothing is known', () => {
    const r = analyzeChannel({ channel: newChannel(), loudspeaker: null, amplifier: null, dsp: null });
    expect(r.blocked).toBe(true);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it('never marks a result field-verified without a measurement', () => {
    const r = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({ nominalImpedance: spec(8, 'ohm'), aesPower: spec(400, 'W') }),
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB'), ratings: [{ impedanceOhm: 8, powerW: 4000, status: 'manufacturer' }] }),
      dsp: newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu') }),
    });
    expect(isKnown(r.domains.thermal.threshold)).toBe(true);
    expect(r.domains.thermal.fieldVerified).toBe(false);
  });

  it('marks a result field-verified once a measured gain is supplied', () => {
    const r = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({
        nominalImpedance: spec(8, 'ohm'),
        publishedRmsVoltage: spec(50, 'Vrms'),
      }),
      amplifier: newAmplifier({ voltageGainDb: spec(32, 'dB'), ratings: [{ impedanceOhm: 8, powerW: 4000, status: 'manufacturer' }] }),
      dsp: newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: measured(18, 'dBu') }),
      measuredGainDb: 31.4,
    });
    expect(r.domains.thermal.fieldVerified).toBe(true);
    expect(r.domains.thermal.requiredDspOutputDbu.certainty).toBe('high');
  });

  it('propagates the worst status and certainty of its inputs', () => {
    expect(derivedStatus('manufacturer', 'estimated')).toBe('estimated');
    expect(derivedStatus('measured', 'measured')).toBe('measured');
    expect(derivedStatus('measured', 'unknown')).toBe('unknown');
    expect(worstCertainty('high', 'low')).toBe('low');
    expect(worstCertainty('high', 'high')).toBe('high');
  });
});

describe('Field calibration', () => {
  it('derives the voltage gain from a measurement', () => {
    const ref = dspReference(newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu') }));
    const m = newMeasurement({
      signal: 'sine-1k',
      dspOutputLevel: 0,
      dspOutputScale: 'dBu',
      measuredVrms: 30.9,
      instrument: 'Fluke 87V',
      instrumentTrueRms: true,
      loadOhm: 8,
    });
    const cal = calibrateGain(m, ref);
    expect(cal.gainDb.value).toBeCloseTo(vrmsToDbu(30.9), 6);
    expect(cal.gainDb.status).toBe('measured');
    expect(cal.missing).toHaveLength(0);
  });

  it('refuses to derive a gain from a dBFS test level with no reference', () => {
    const ref = dspReference(newDsp());
    const cal = calibrateGain(
      newMeasurement({ dspOutputLevel: -20, dspOutputScale: 'dBFS', measuredVrms: 5, instrumentTrueRms: true }),
      ref,
    );
    expect(isKnown(cal.gainDb)).toBe(false);
    expect(cal.missing.map((x) => x.field)).toContain('Analog full-scale reference (dBu)');
  });

  it('establishes the analog full-scale reference by measurement', () => {
    // -20 dBFS produced 0.775 Vrms (0 dBu) -> full scale is +20 dBu under AES17.
    const t = calibrateDspOutput(0.775, -20, conventionOffsetDb('aes17'));
    expect(t.value).toBeCloseTo(20, 6);
    expect(t.status).toBe('measured');
  });

  it('refuses that calibration while the convention is unknown', () => {
    expect(isKnown(calibrateDspOutput(0.775, -20, conventionOffsetDb('unknown')))).toBe(false);
  });

  it('flags an instrument that cannot measure the chosen signal', () => {
    const check = checkInstrument(
      newMeasurement({ signal: 'pink-noise', instrument: 'Cheap DMM', instrumentTrueRms: false }),
      'pink-noise',
    );
    expect(check.ok).toBe(false);
    expect(check.issues).toContain('needsTrueRms');
  });

  it('rejects music as a gain calibration signal', () => {
    const check = checkInstrument(
      newMeasurement({ signal: 'music', instrument: 'Fluke', instrumentTrueRms: true }),
      'music',
    );
    expect(check.issues).toContain('signalNotForGain');
  });

  it('warns about bridged measurement and high voltages', () => {
    const w = safetyWarnings(newAmplifier({ mode: 'bridge' }), 180).join(' ');
    expect(w).toMatch(/BRIDGED OUTPUT/);
    expect(w).toMatch(/180\.0 Vrms/);
    expect(w).toMatch(/LOW level first/);
  });

  it('computes a safe low-level test point and the voltage it should produce', () => {
    const t = safeTestLevel(89.44, 20);
    expect(t.vrms).toBeCloseTo(8.944, 3);
    expect(expectedOutputVrms(0, 32)).toBeCloseTo(0.775 * Math.pow(10, 32 / 20), 6);
  });

  it('compares planned against measured', () => {
    const d = deviation(28.284, 28.0, 0.5);
    expect(d.deltaDb).toBeCloseTo(-0.0876, 3);
    expect(d.withinTolerance).toBe(true);
    expect(deviation(28.284, 20, 0.5).withinTolerance).toBe(false);
    expect(deviation(null, 20).deltaDb).toBeNull();
  });
});

describe('Dynamic parameters', () => {
  it('gives sub-band guidance and the period of the lower cutoff', () => {
    const t = timingReference({
      limiterType: 'peak',
      domain: 'peak',
      lowerCutoffHz: 40,
      upperCutoffHz: 100,
      detectionMode: 'peak',
      band: 'sub',
    });
    expect(t.periodMs).toBeCloseTo(25, 6);
    expect(t.guidanceKeys).toContain('subBand');
    expect(t.caveats.join(' ')).toMatch(/not protection guarantees/);
  });

  it('keeps thermal release slow and states why', () => {
    const t = timingReference({
      limiterType: 'rms',
      domain: 'thermal',
      lowerCutoffHz: 80,
      upperCutoffHz: 1000,
      detectionMode: 'rms',
      band: 'low',
      thermalTimeConstantS: 10,
    });
    expect(t.releaseRangeMs![0]).toBeGreaterThanOrEqual(1000);
    expect(t.caveats.join(' ')).toMatch(/voice-coil heating/);
  });

  it('warns that a compressor with a finite ratio is not a protection device', () => {
    const t = timingReference({
      limiterType: 'compressor',
      domain: 'thermal',
      lowerCutoffHz: null,
      upperCutoffHz: null,
      detectionMode: 'rms',
      band: 'full',
    });
    expect(t.caveats.join(' ')).toMatch(/not a protection device/);
  });

  it('explains the crest factor offset of an RMS detector', () => {
    expect(crestFactorEffect(12).peakAboveThresholdDb).toBe(12);
    expect(crestFactorEffect(12).note).toMatch(/12\.0 dB above the RMS threshold/);
  });
});

describe('Quality review fixes', () => {
  const speaker = () =>
    newLoudspeaker({ nominalImpedance: spec(8, 'ohm'), aesPower: spec(400, 'W') });
  const amp = () =>
    newAmplifier({
      voltageGainDb: spec(32, 'dB'),
      ratings: [{ impedanceOhm: 8, powerW: 4000, status: 'manufacturer' }],
    });

  it('does not reuse a single undifferentiated limiter across protection domains', () => {
    const single = newLimiterStage({ type: 'single-unspecified', protects: 'thermal', thresholdScale: 'dBu' });
    const r = analyzeChannel({
      channel: newChannel(),
      loudspeaker: newLoudspeaker({
        nominalImpedance: spec(8, 'ohm'),
        aesPower: spec(400, 'W'),
        publishedPeakVoltage: spec(120, 'Vpeak'),
      }),
      amplifier: amp(),
      dsp: newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu'), limiters: [single] }),
    });
    // The limiter serves the thermal domain it was assigned to...
    expect(isKnown(r.domains.thermal.threshold)).toBe(true);
    // ...and does NOT silently also serve the peak domain.
    expect(isKnown(r.domains.peak.threshold)).toBe(false);
    expect((r.domains.peak.threshold.notes ?? []).join(' ')).toMatch(/No peak limiter stage is configured/);
    expect(r.warnings.join(' ')).toMatch(/single limiter with no RMS \/ peak separation/);
  });

  it('reports a watt-denominated threshold as power at the amplifier output', () => {
    const r = analyzeChannel({
      channel: newChannel({ margins: { thermalDb: 0, peakDb: 0, clipDb: 0 } }),
      loudspeaker: speaker(),
      amplifier: amp(),
      dsp: newDsp({
        dbfsConvention: 'aes17',
        analogFullScaleDbu: spec(18, 'dBu'),
        limiters: [newLimiterStage({ type: 'rms', protects: 'thermal', thresholdScale: 'W' })],
      }),
    });
    const th = r.domains.thermal.threshold;
    expect(th.unit).toBe('W');
    // 400 W AES into 8 ohm, no margin: the equivalent power at the amplifier output.
    expect(th.value).toBeCloseTo(400, 6);
    expect((th.notes ?? []).join(' ')).toMatch(/AMPLIFIER output/);
  });

  it('never derives a watt figure from a DSP output level', () => {
    const ref = dspReference(newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu') }));
    expect(isKnown(expressThreshold(0, 'W', ref, { impedanceOhm: 8 }))).toBe(false);
  });

  it('stays silent about limiter gaps until a processor is assigned', () => {
    const noDsp = analyzeChannel({
      channel: newChannel(),
      loudspeaker: speaker(),
      amplifier: amp(),
      dsp: null,
    });
    expect(noDsp.warnings.join(' ')).not.toMatch(/No peak limiter is configured/);
    const withDsp = analyzeChannel({
      channel: newChannel(),
      loudspeaker: speaker(),
      amplifier: amp(),
      dsp: newDsp({ limiters: [newLimiterStage({ type: 'rms', protects: 'thermal' })] }),
    });
    expect(withDsp.warnings.join(' ')).toMatch(/No peak limiter is configured/);
  });

  it('derives a measured gain from a test level recorded in dBFS, not only in dBu', () => {
    const ref = dspReference(newDsp({ dbfsConvention: 'aes17', analogFullScaleDbu: spec(18, 'dBu') }));
    // -18 dBFS under AES17 with a +18 dBu full scale is 0 dBu at the analog output.
    const m = newMeasurement({
      dspOutputLevel: -18,
      dspOutputScale: 'dBFS',
      measuredVrms: 30.9,
      instrument: 'true-RMS meter',
      instrumentTrueRms: true,
      loadOhm: 8,
    });
    const cal = calibrateGain(m, ref);
    expect(isKnown(cal.gainDb)).toBe(true);
    expect(cal.gainDb.value).toBeCloseTo(vrmsToDbu(30.9), 6);
    expect(cal.gainDb.status).toBe('measured');
  });
});
