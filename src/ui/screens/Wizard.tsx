import { useState } from 'react';
import {
  Card,
  ChannelPicker,
  Checkbox,
  Empty,
  MissingList,
  Notice,
  NoProject,
  PageHead,
  PlainNumberField,
  SelectField,
  TextField,
  ValueView,
  WarningList,
  fmt,
  fmtSigned,
} from '../components';
import { useStore } from '../../state/store';
import {
  Measurement,
  ProtectionDomain,
  TEST_SIGNALS,
  ThresholdScale,
  calibrateDspOutput,
  calibrateGain,
  checkInstrument,
  conventionOffsetDb,
  deviation,
  dspLevelToDbu,
  expectedOutputVrms,
  isKnown,
  newMeasurement,
  safeTestLevel,
  safetyWarnings,
  testSignal,
  vrmsToDbu,
} from '../../engine';
import { useAnalysis } from '../useAnalysis';
import { TranslationKey } from '../../i18n';

const STEP_KEYS = [
  'wiz.s1', 'wiz.s2', 'wiz.s3', 'wiz.s4', 'wiz.s5', 'wiz.s6',
  'wiz.s7', 'wiz.s8', 'wiz.s9', 'wiz.s10', 'wiz.s11', 'wiz.s12',
] as const;

export function Wizard() {
  const { t, project, channel, updateChannel, upsertDsp } = useStore();
  const a = useAnalysis();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Measurement>(() => newMeasurement());
  const [backoffDb, setBackoffDb] = useState<number | null>(20);
  const [limiterSet, setLimiterSet] = useState(false);
  const [verifyVrms, setVerifyVrms] = useState<number | null>(null);
  const [clipObserved, setClipObserved] = useState(false);
  const [dynamicNotes, setDynamicNotes] = useState('');
  const [savedNote, setSavedNote] = useState('');

  if (!project) return <><PageHead title={t('wiz.title')} sub={t('wiz.subtitle')} /><NoProject /></>;
  if (!channel || !a)
    return (
      <>
        <PageHead title={t('wiz.title')} sub={t('wiz.subtitle')} />
        <Empty text={t('wiz.noChannel')} />
      </>
    );

  const dsp = project.dsps.find((d) => d.id === channel.dspId) ?? null;
  const amplifier = project.amplifiers.find((x) => x.id === channel.amplifierId) ?? null;
  const thermal = a.domains.thermal;
  const targetVrms = isKnown(thermal.targetAtAmplifier) ? thermal.targetAtAmplifier.value : null;
  const sig = testSignal(draft.signal);
  const instrument = checkInstrument(draft, draft.signal);
  const cal = calibrateGain(draft, a.dspRef);
  const suggestion = targetVrms !== null ? safeTestLevel(targetVrms, backoffDb ?? 20) : null;

  const setDraftField = <K extends keyof Measurement>(k: K, v: Measurement[K]) => setDraft({ ...draft, [k]: v });

  return (
    <>
      <PageHead title={t('wiz.title')} sub={t('wiz.subtitle')} />
      <ChannelPicker />

      <div className="steps">
        {STEP_KEYS.map((k, i) => (
          <button
            key={k}
            className={`step-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            onClick={() => setStep(i)}
          >
            {i + 1}. {t(k)}
          </button>
        ))}
      </div>

      <Card title={`${t('wiz.step')} ${step + 1} ${t('wiz.of')} 12 — ${t(STEP_KEYS[step])}`}>
        {/* ---------------------------------------------------------- 1 */}
        {step === 0 && (
          <>
            <Notice kind={a.missing.length === 0 ? 'ok' : 'warn'}>
              {a.missing.length === 0 ? t('wiz.dataOk') : t('wiz.dataMissing')}
            </Notice>
            <MissingList missing={a.missing} />
            <WarningList warnings={a.warnings} />
            <div className="grid">
              {a.speaker && <ValueView label={t('calc.rmsVoltageLimit')} value={a.speaker.rmsAtAmplifier} />}
              {a.speaker && <ValueView label={t('calc.peakVoltageLimit')} value={a.speaker.peakAtAmplifier} />}
              {a.amp && <ValueView label={t('calc.gain')} value={a.amp.gainDb} />}
              {a.amp && <ValueView label={t('calc.maxOutputVoltage')} value={a.amp.maxOutputVrms} />}
            </div>
          </>
        )}

        {/* ---------------------------------------------------------- 2 */}
        {step === 1 && (
          <>
            <Notice kind="warn">{t('chain.marginHelp')}</Notice>
            <div className="grid">
              {(['thermal', 'peak', 'clip'] as ProtectionDomain[]).map((d) => (
                <div key={d}>
                  <PlainNumberField
                    label={`${t(`domain.${d}` as TranslationKey)} — ${t('calc.safetyMargin')}`}
                    unit="dB"
                    value={
                      d === 'thermal' ? channel.margins.thermalDb : d === 'peak' ? channel.margins.peakDb : channel.margins.clipDb
                    }
                    onChange={(v) =>
                      updateChannel(channel.id, {
                        margins: {
                          ...channel.margins,
                          [d === 'thermal' ? 'thermalDb' : d === 'peak' ? 'peakDb' : 'clipDb']: v ?? 0,
                        },
                      })
                    }
                  />
                  <ValueView label={t('calc.target')} value={a.domains[d].targetAtAmplifier} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---------------------------------------------------------- 3 */}
        {step === 2 && (
          <>
            <WarningList warnings={a.gains.warnings} />
            <div className="grid">
              <ValueView label={t('chain.preTotal')} value={a.gains.preLimiterDb} decimals={2} />
              <ValueView label={t('chain.postTotal')} value={a.gains.postLimiterDb} decimals={2} />
            </div>
            <Notice kind={amplifier?.gainControlPosition ? 'ok' : 'warn'}>
              {t('amp.gainControl')}: {amplifier?.gainControlPosition || t('g.notSet')}
            </Notice>
            <Notice kind={amplifier?.internalLimiter === 'none' ? 'ok' : 'warn'}>
              {t('amp.internalLimiter')}:{' '}
              {t(`amp.internalLimiter.${amplifier?.internalLimiter ?? 'unknown'}` as TranslationKey)}
            </Notice>
          </>
        )}

        {/* ---------------------------------------------------------- 4 */}
        {step === 3 && (
          <>
            <SelectField
              label={t('wiz.signal')}
              value={draft.signal}
              onChange={(v) => setDraftField('signal', v)}
              options={TEST_SIGNALS.map((s) => ({ value: s.id, label: t(`wiz.signal.${s.id}` as TranslationKey) }))}
            />
            {sig && (
              <>
                <p className="small muted">
                  {t('wiz.signalCrest')}: <span className="mono">{fmt(sig.crestFactorDb, 2)} dB</span>
                </p>
                {sig.thermallyHazardous && <Notice kind="warn">{t('wiz.signalHazard')}</Notice>}
                {!sig.goodForGain && <Notice kind="danger">{t('wiz.signalNotForGain')}</Notice>}
                {sig.requiresTrueRms && <Notice kind="warn">{t('wiz.needsTrueRms')}</Notice>}
              </>
            )}
          </>
        )}

        {/* ---------------------------------------------------------- 5 */}
        {step === 4 && (
          <>
            <TextField
              label={t('wiz.instrument')}
              value={draft.instrument}
              onChange={(v) => setDraftField('instrument', v)}
              placeholder="e.g. true-RMS multimeter, model"
            />
            <Checkbox
              label={t('wiz.trueRms')}
              checked={draft.instrumentTrueRms}
              onChange={(v) => setDraftField('instrumentTrueRms', v)}
            />
            <Notice kind={instrument.ok ? 'ok' : 'warn'}>
              {instrument.ok ? t('wiz.instrumentOk') : null}
              {!instrument.ok && (
                <ul>
                  {instrument.issues.map((i) => (
                    <li key={i}>{t(`wiz.${i}` as TranslationKey)}</li>
                  ))}
                </ul>
              )}
            </Notice>
          </>
        )}

        {/* ---------------------------------------------------------- 6 */}
        {step === 5 && (
          <>
            <div className="notice danger">
              <strong>{t('wiz.safety')}</strong>
              <ul>
                {safetyWarnings(amplifier, targetVrms).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
            <div className="grid">
              <PlainNumberField label={t('wiz.backoff')} unit="dB" value={backoffDb} onChange={setBackoffDb} />
              {suggestion && (
                <div className="value">
                  <div className="vlabel">{t('wiz.suggestLevel')}</div>
                  <div className="vmain">
                    <span className="vnum">{fmt(suggestion.vrms, 3)}</span>
                    <span className="vunit">Vrms</span>
                  </div>
                  <div className="vmeta">
                    <span className="badge tiny mono">{fmt(vrmsToDbu(suggestion.vrms), 2)} dBu</span>
                  </div>
                </div>
              )}
            </div>
            <div className="grid">
              <PlainNumberField
                label={t('wiz.testLevel')}
                value={draft.dspOutputLevel}
                onChange={(v) => setDraftField('dspOutputLevel', v)}
                unit={draft.dspOutputScale}
              />
              <SelectField<ThresholdScale>
                label={`${t('wiz.testLevel')} — ${t('g.unit')}`}
                value={draft.dspOutputScale}
                onChange={(v) => setDraftField('dspOutputScale', v)}
                options={(['dBu', 'dBV', 'dBFS', 'Vrms'] as ThresholdScale[]).map((s) => ({ value: s, label: s }))}
              />
              <PlainNumberField
                label={t('wiz.measuredVrms')}
                unit="Vrms"
                value={draft.measuredVrms}
                onChange={(v) => setDraftField('measuredVrms', v)}
              />
              <PlainNumberField
                label={t('wiz.measuredVpeak')}
                unit="Vpeak"
                value={draft.measuredVpeak}
                onChange={(v) => setDraftField('measuredVpeak', v)}
                hint={t('g.optional')}
              />
              <PlainNumberField
                label={t('wiz.loadOhm')}
                unit="ohm"
                value={draft.loadOhm}
                onChange={(v) => setDraftField('loadOhm', v)}
              />
            </div>
            {draft.dspOutputLevel !== null && a.amp && isKnown(a.amp.gainDb) && (
              <p className="small muted">
                {t('wiz.expected')}:{' '}
                <span className="mono">
                  {(() => {
                    const dbu = dspLevelToDbu(draft.dspOutputLevel, draft.dspOutputScale, a.dspRef);
                    const g = a.amp && isKnown(a.amp.gainDb) ? a.amp.gainDb.value : null;
                    return dbu !== null && g !== null ? `${fmt(expectedOutputVrms(dbu, g), 3)} Vrms` : '—';
                  })()}
                </span>
              </p>
            )}
          </>
        )}

        {/* ---------------------------------------------------------- 7 */}
        {step === 6 && (
          <>
            <MissingList missing={cal.missing} />
            <WarningList warnings={cal.warnings} />
            <div className="grid">
              <ValueView label={t('wiz.calibratedGain')} value={cal.gainDb} emphasis />
              <ValueView label={t('wiz.impliedFs')} value={cal.impliedFullScaleDbu} />
            </div>
            <div className="row">
              <button
                disabled={!isKnown(cal.gainDb)}
                className="primary"
                onClick={() => {
                  // Saving the measurement is what applies the measured gain to the channel.
                  updateChannel(channel.id, {
                    measurements: [...channel.measurements, { ...draft, id: newMeasurement().id, timestamp: new Date().toISOString() }],
                  });
                  setSavedNote(t('wiz.applied'));
                }}
              >
                {t('wiz.applyGain')}
              </button>
              <button
                disabled={!dsp || !isKnown(cal.impliedFullScaleDbu)}
                onClick={() => {
                  if (!dsp || !isKnown(cal.impliedFullScaleDbu)) return;
                  upsertDsp({
                    ...dsp,
                    analogFullScaleDbu: {
                      value: cal.impliedFullScaleDbu.value,
                      unit: 'dBu',
                      status: 'measured',
                      note: 'Established by field measurement',
                    },
                  });
                  setSavedNote(t('wiz.applied'));
                }}
              >
                {t('wiz.applyFs')}
              </button>
            </div>
            {dsp && dsp.dbfsConvention !== 'unknown' && draft.measuredVrms !== null && draft.dspOutputScale === 'dBFS' && (
              <div className="grid" style={{ marginTop: 10 }}>
                <ValueView
                  label={t('dsp.analogFs')}
                  value={calibrateDspOutput(
                    draft.measuredVrms,
                    draft.dspOutputLevel ?? 0,
                    conventionOffsetDb(dsp.dbfsConvention),
                  )}
                />
              </div>
            )}
            {savedNote && <Notice kind="ok">{savedNote}</Notice>}
          </>
        )}

        {/* ---------------------------------------------------------- 8 */}
        {step === 7 && (
          <>
            <Notice kind="warn">{t('calc.notComplete')}</Notice>
            <div className="grid">
              {(['thermal', 'peak', 'clip'] as ProtectionDomain[]).map((d) => (
                <ValueView
                  key={d}
                  label={`${t(`domain.${d}` as TranslationKey)} — ${t('calc.threshold')}`}
                  value={a.domains[d].threshold}
                  decimals={2}
                  emphasis
                />
              ))}
            </div>
            <MissingList missing={a.missing} />
          </>
        )}

        {/* ---------------------------------------------------------- 9 */}
        {step === 8 && (
          <>
            <Notice kind="info">{t('wiz.setLimiter')}</Notice>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('dsp.protects')}</th>
                    <th>{t('dsp.limiterType')}</th>
                    <th className="num">{t('calc.threshold')}</th>
                    <th className="num">{t('dsp.attack')}</th>
                    <th className="num">{t('dsp.release')}</th>
                    <th className="num">{t('dsp.hold')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(dsp?.limiters ?? []).map((lim) => {
                    const th = a.domains[lim.protects].threshold;
                    return (
                      <tr key={lim.id}>
                        <td>{t(`domain.${lim.protects}.short` as TranslationKey)}</td>
                        <td>{t(`dsp.type.${lim.type}` as TranslationKey)}</td>
                        <td className="num">
                          {isKnown(th) ? `${fmt(th.value, 2)} ${th.unit}` : t('g.notSet')}
                        </td>
                        <td className="num">{lim.attackMs.value ?? '—'}</td>
                        <td className="num">{lim.releaseMs.value ?? '—'}</td>
                        <td className="num">{lim.holdMs.value ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Checkbox label={t('wiz.confirmSet')} checked={limiterSet} onChange={setLimiterSet} />
          </>
        )}

        {/* ---------------------------------------------------------- 10 */}
        {step === 9 && (
          <>
            <Notice kind="warn">{t('wiz.verifyHelp')}</Notice>
            <div className="grid">
              <PlainNumberField label={t('wiz.verifyVrms')} unit="Vrms" value={verifyVrms} onChange={setVerifyVrms} />
              <div>
                <Checkbox label={t('wiz.clipObserved')} checked={clipObserved} onChange={setClipObserved} />
                {clipObserved && (
                  <Notice kind="danger">
                    The amplifier is clipping at or below the protection target. Reduce the threshold, check the gain
                    structure, or re-derive the amplifier limit before using the system.
                  </Notice>
                )}
              </div>
            </div>
            {(() => {
              const d = deviation(targetVrms, verifyVrms, 0.5);
              if (d.deltaDb === null) return null;
              return (
                <Notice kind={d.withinTolerance ? 'ok' : 'danger'}>
                  {t('wiz.deviation')}: <span className="mono">{fmtSigned(d.deltaDb, 2)} dB</span> ·{' '}
                  {d.withinTolerance ? t('wiz.withinTolerance') : t('wiz.outsideTolerance')}
                </Notice>
              );
            })()}
          </>
        )}

        {/* ---------------------------------------------------------- 11 */}
        {step === 10 && (
          <>
            <Notice kind="info">{t('wiz.dynamicHelp')}</Notice>
            <TextField label={t('wiz.dynamicNotes')} value={dynamicNotes} onChange={setDynamicNotes} multiline />
          </>
        )}

        {/* ---------------------------------------------------------- 12 */}
        {step === 11 && (
          <>
            <Notice kind={isKnown(cal.gainDb) ? 'ok' : 'warn'}>
              {isKnown(cal.gainDb) ? t('wiz.dataOk') : t('wiz.dataMissing')}
            </Notice>
            <button
              className="primary"
              onClick={() => {
                const record: Measurement = {
                  ...draft,
                  id: newMeasurement().id,
                  timestamp: new Date().toISOString(),
                  crestFactorDb: sig?.crestFactorDb ?? draft.crestFactorDb,
                  notes: [
                    draft.notes,
                    limiterSet ? 'Limiter values entered in the device.' : '',
                    verifyVrms !== null ? `Verified at ${verifyVrms} Vrms.` : '',
                    clipObserved ? 'Amplifier clipping was observed during verification.' : '',
                    dynamicNotes ? `Dynamic behaviour: ${dynamicNotes}` : '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                };
                updateChannel(channel.id, { measurements: [...channel.measurements, record] });
                setSavedNote(t('wiz.saved'));
              }}
            >
              {t('wiz.saveResult')}
            </button>
            {savedNote && <Notice kind="ok">{savedNote}</Notice>}

            <h3>{t('wiz.measurements')}</h3>
            {channel.measurements.length === 0 ? (
              <Empty text={t('res.noMeasurements')} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('res.generated')}</th>
                      <th>{t('wiz.signal')}</th>
                      <th className="num">{t('wiz.testLevel')}</th>
                      <th className="num">{t('wiz.measuredVrms')}</th>
                      <th className="num">{t('wiz.loadOhm')}</th>
                      <th>{t('wiz.instrument')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channel.measurements.map((m) => (
                      <tr key={m.id}>
                        <td className="tiny">{new Date(m.timestamp).toLocaleString()}</td>
                        <td>{t(`wiz.signal.${m.signal}` as TranslationKey)}</td>
                        <td className="num">
                          {m.dspOutputLevel ?? '—'} {m.dspOutputScale}
                        </td>
                        <td className="num">{m.measuredVrms ?? '—'}</td>
                        <td className="num">{m.loadOhm ?? '—'}</td>
                        <td className="tiny">
                          {m.instrument || '—'}
                          {m.instrumentTrueRms ? ' (true RMS)' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <hr className="sep" />
        <div className="row">
          <button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            {t('g.back')}
          </button>
          <button className="primary" disabled={step === 11} onClick={() => setStep((s) => Math.min(11, s + 1))}>
            {t('g.next')}
          </button>
        </div>
      </Card>
    </>
  );
}
