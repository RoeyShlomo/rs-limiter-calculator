import { useState } from 'react';
import {
  Card,
  Notice,
  PageHead,
  PlainNumberField,
  SelectField,
  ValueView,
  fmt,
  fmtSigned,
} from '../components';
import { useStore } from '../../state/store';
import {
  CONVENTION_LABELS,
  DbfsConvention,
  SpeakerConnection,
  WAVEFORMS,
  computeLoad,
  conventionOffsetDb,
  dbuToVrms,
  dbvToVrms,
  inputVrmsForOutput,
  powerFromVrms,
  ratioToDb,
  tracked,
  unknown,
  vrmsFromPower,
  vrmsToDbu,
  vrmsToDbv,
  vrmsToVpeak,
  voltageGainDb,
} from '../../engine';
import { TranslationKey } from '../../i18n';

/** Standalone conversions. Nothing here is persisted and no project is needed. */
export function QuickCalculator() {
  const { t } = useStore();
  return (
    <>
      <PageHead title={t('quick.title')} sub={t('quick.subtitle')} />
      <PowerVoltage />
      <LevelConversions />
      <GainCalculator />
      <ThresholdCalculator />
      <LoadCalculator />
    </>
  );
}

// ---------------------------------------------------------------------------

function PowerVoltage() {
  const { t } = useStore();
  const [powerW, setPowerW] = useState<number | null>(100);
  const [impedance, setImpedance] = useState<number | null>(8);

  const vrms = powerW !== null && impedance !== null && impedance > 0 ? vrmsFromPower(powerW, impedance) : null;

  return (
    <Card title={t('quick.powerVoltage')}>
      <div className="grid">
        <PlainNumberField label={t('quick.power')} value={powerW} onChange={setPowerW} unit="W" />
        <PlainNumberField label={t('quick.impedance')} value={impedance} onChange={setImpedance} unit="ohm" />
      </div>
      <Notice kind="warn">{t('quick.nominalWarning')}</Notice>
      <div className="grid">
        <ValueView
          label="Vrms = sqrt(P x R)"
          value={
            vrms === null
              ? unknown('Vrms', 'rms', t('err.required'))
              : tracked(vrms, 'Vrms', 'rms', 'calculated', 'medium', {
                  formula: `Vrms = sqrt(P * R) = sqrt(${powerW} W * ${impedance} ohm)`,
                })
          }
        />
        <ValueView
          label="dBu"
          value={
            vrms === null
              ? unknown('dBu', 'level', t('err.required'))
              : tracked(vrmsToDbu(vrms), 'dBu', 'level', 'calculated', 'medium', {
                  formula: `dBu = 20 * log10(Vrms / 0.775) = 20 * log10(${fmt(vrms, 4)} / 0.775)`,
                })
          }
        />
        <ValueView
          label="dBV"
          value={
            vrms === null
              ? unknown('dBV', 'level', t('err.required'))
              : tracked(vrmsToDbv(vrms), 'dBV', 'level', 'calculated', 'medium', {
                  formula: `dBV = 20 * log10(Vrms / 1) = 20 * log10(${fmt(vrms, 4)})`,
                })
          }
        />
        <ValueView
          label={`P = Vrms^2 / R (${t('quick.power')})`}
          value={
            vrms === null || impedance === null
              ? unknown('W', 'power', t('err.required'))
              : tracked(powerFromVrms(vrms, impedance), 'W', 'power', 'calculated', 'medium', {
                  formula: `P = Vrms^2 / R = (${fmt(vrms, 4)} V)^2 / ${impedance} ohm`,
                  notes: [t('quick.nominalWarning')],
                })
          }
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

type RmsScale = 'Vrms' | 'dBu' | 'dBV';

function LevelConversions() {
  const { t } = useStore();
  const [input, setInput] = useState<number | null>(28.284);
  const [scale, setScale] = useState<RmsScale>('Vrms');
  const [waveformId, setWaveformId] = useState<string>('sine');

  const wf = WAVEFORMS.find((w) => w.id === waveformId)!;
  const vrms =
    input === null ? null : scale === 'Vrms' ? input : scale === 'dBu' ? dbuToVrms(input) : dbvToVrms(input);

  return (
    <Card title={t('quick.levels')}>
      <div className="grid">
        <PlainNumberField label={t('g.value')} value={input} onChange={setInput} />
        <SelectField<RmsScale>
          label={t('g.unit')}
          value={scale}
          onChange={setScale}
          options={[
            { value: 'Vrms', label: 'Vrms' },
            { value: 'dBu', label: 'dBu' },
            { value: 'dBV', label: 'dBV' },
          ]}
        />
        <SelectField
          label={t('quick.waveform')}
          value={waveformId}
          onChange={setWaveformId}
          options={WAVEFORMS.map((w) => ({
            value: w.id,
            label: `${w.id} — ${fmt(w.crestFactorDb, 2)} dB${w.exact ? '' : ' *'}`,
          }))}
          hint={t('quick.crestHint')}
        />
      </div>

      <h3>{t('quick.rmsDomain')}</h3>
      <div className="grid">
        <ValueView label="Vrms" value={mk(vrms, 'Vrms', 'rms', 'Vrms')} />
        <ValueView label="dBu" value={mk(vrms === null ? null : vrmsToDbu(vrms), 'dBu', 'level', 'dBu = 20 * log10(Vrms / 0.775)')} />
        <ValueView label="dBV" value={mk(vrms === null ? null : vrmsToDbv(vrms), 'dBV', 'level', 'dBV = 20 * log10(Vrms / 1)')} />
      </div>

      <h3>{t('quick.peakDomain')}</h3>
      <Notice kind="info">{t('quick.crestHint')}</Notice>
      <div className="grid">
        <ValueView
          label={`Vpeak (crest factor ${fmt(wf.crestFactorDb, 2)} dB)`}
          value={
            vrms === null
              ? unknown('Vpeak', 'peak', t('err.required'))
              : tracked(vrmsToVpeak(vrms, wf.crestFactorDb), 'Vpeak', 'peak', 'calculated', wf.exact ? 'high' : 'low', {
                  formula: `Vpeak = Vrms * 10^(crest factor / 20) = ${fmt(vrms, 4)} * 10^(${fmt(wf.crestFactorDb, 4)} / 20)`,
                  notes: wf.exact
                    ? ['Explicit RMS to peak crossing using a defined waveform crest factor.']
                    : [
                        'The crest factor of this signal type is a typical figure, not a defined property. The ' +
                          'peak value is therefore an estimate.',
                      ],
                })
          }
        />
        <ValueView
          label={t('quick.crestFactor')}
          value={tracked(wf.crestFactorDb, 'dB', 'ratio', wf.exact ? 'calculated' : 'estimated', wf.exact ? 'high' : 'low', {
            formula: 'crest factor (dB) = 20 * log10(Vpeak / Vrms)',
          })}
          decimals={4}
        />
      </div>
      <p className="tiny faint">* {t('status.estimated')}</p>
    </Card>
  );
}

function mk(value: number | null, unit: 'Vrms' | 'dBu' | 'dBV', domain: 'rms' | 'level', formula: string) {
  return value === null
    ? unknown(unit, domain, 'Enter a value.')
    : tracked(value, unit, domain, 'calculated', 'high', { formula });
}

// ---------------------------------------------------------------------------

function GainCalculator() {
  const { t } = useStore();
  const [vout, setVout] = useState<number | null>(89.443);
  const [vin, setVin] = useState<number | null>(1.4);
  const [gain, setGain] = useState<number | null>(36.11);

  const computedGain = vout !== null && vin !== null && vin > 0 && vout > 0 ? voltageGainDb(vout, vin) : null;
  const computedVin = vout !== null && gain !== null && vout > 0 ? inputVrmsForOutput(vout, gain) : null;

  return (
    <Card title={t('quick.gain')}>
      <div className="grid">
        <PlainNumberField label={t('quick.vout')} value={vout} onChange={setVout} unit="Vrms" />
        <PlainNumberField label={t('quick.vin')} value={vin} onChange={setVin} unit="Vrms" />
      </div>
      <div className="grid">
        <ValueView
          label={t('quick.gainResult')}
          value={
            computedGain === null
              ? unknown('dB', 'ratio', t('err.required'))
              : tracked(computedGain, 'dB', 'ratio', 'calculated', 'high', {
                  formula: `Voltage Gain (dB) = 20 * log10(Vout / Vin) = 20 * log10(${vout} / ${vin})`,
                })
          }
        />
      </div>
      <hr className="sep" />
      <div className="grid">
        <PlainNumberField label={t('quick.gainResult')} value={gain} onChange={setGain} unit="dB" />
        <ValueView
          label={t('quick.sensitivityFromGain')}
          value={
            computedVin === null
              ? unknown('Vrms', 'rms', t('err.required'))
              : tracked(computedVin, 'Vrms', 'rms', 'calculated', 'high', {
                  formula: `Vin = Vout / 10^(Gain / 20) = ${vout} / 10^(${gain} / 20)`,
                })
          }
        />
        <ValueView
          label={`${t('quick.sensitivityFromGain')} (dBu)`}
          value={
            computedVin === null
              ? unknown('dBu', 'level', t('err.required'))
              : tracked(vrmsToDbu(computedVin), 'dBu', 'level', 'calculated', 'high', {
                  formula: `dBu = 20 * log10(Vrms / 0.775)`,
                })
          }
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ThresholdCalculator() {
  const { t } = useStore();
  const [targetDbu, setTargetDbu] = useState<number | null>(31.245);
  const [ampGain, setAmpGain] = useState<number | null>(32);
  const [postGain, setPostGain] = useState<number | null>(0);
  const [fsRef, setFsRef] = useState<number | null>(18);
  const [convention, setConvention] = useState<DbfsConvention>('aes17');

  const offset = conventionOffsetDb(convention);
  const requiredDsp = targetDbu !== null && ampGain !== null ? targetDbu - ampGain : null;
  const atLimiter = requiredDsp !== null && postGain !== null ? requiredDsp - postGain : null;
  const dbfs = atLimiter !== null && fsRef !== null && offset !== null ? atLimiter - fsRef + offset : null;

  return (
    <Card title={t('quick.threshold')}>
      <div className="grid">
        <PlainNumberField label={t('quick.targetAmpLevel')} value={targetDbu} onChange={setTargetDbu} unit="dBu" />
        <PlainNumberField label={t('quick.ampGain')} value={ampGain} onChange={setAmpGain} unit="dB" />
        <PlainNumberField label={t('quick.postGain')} value={postGain} onChange={setPostGain} unit="dB" />
        <PlainNumberField label={t('quick.fsRef')} value={fsRef} onChange={setFsRef} unit="dBu" />
        <SelectField<DbfsConvention>
          label={t('quick.convention')}
          value={convention}
          onChange={setConvention}
          options={(['aes17', 'peak-referenced', 'unknown'] as DbfsConvention[]).map((c) => ({
            value: c,
            label: t(`dsp.convention.${c}` as TranslationKey),
          }))}
        />
      </div>
      <div className="grid">
        <ValueView
          label={t('quick.requiredDsp')}
          value={
            requiredDsp === null
              ? unknown('dBu', 'level', t('err.required'))
              : tracked(requiredDsp, 'dBu', 'level', 'calculated', 'medium', {
                  formula:
                    'Required DSP Output Level (dBu) = Target Amplifier Output Level (dBu) - Amplifier ' +
                    `Voltage Gain (dB) = ${targetDbu} - ${ampGain}`,
                })
          }
        />
        <ValueView
          label={t('calc.atLimiter')}
          value={
            atLimiter === null
              ? unknown('dBu', 'level', t('err.required'))
              : tracked(atLimiter, 'dBu', 'level', 'calculated', 'medium', {
                  formula: `Threshold at limiter node (dBu) = Required DSP Output Level - post-limiter gain = ${fmt(
                    requiredDsp,
                    3,
                  )} - ${postGain}`,
                  notes:
                    postGain !== 0
                      ? ['A change to any post-limiter gain invalidates this threshold.']
                      : undefined,
                })
          }
        />
        <ValueView
          label={`${t('quick.thresholdDbfs')} (dBFS)`}
          value={
            dbfs === null
              ? unknown('dBFS', 'level', t('quick.noDbfs'))
              : tracked(dbfs, 'dBFS', 'level', 'calculated', 'medium', {
                  formula:
                    'Threshold (dBFS) = Required DSP Output Level (dBu) - Analog Full-Scale Reference (dBu) ' +
                    `+ convention offset = ${fmt(atLimiter, 3)} - ${fsRef} + ${fmt(offset, 3)}`,
                  notes: [`Convention: ${CONVENTION_LABELS[convention]}.`],
                })
          }
          emphasis
        />
      </div>
      {offset === null && <Notice kind="danger">{t('quick.noDbfs')}</Notice>}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function LoadCalculator() {
  const { t } = useStore();
  const [z, setZ] = useState<number | null>(8);
  const [connection, setConnection] = useState<SpeakerConnection>('parallel');
  const [series, setSeries] = useState<number | null>(1);
  const [parallel, setParallel] = useState<number | null>(2);
  const [ampVrms, setAmpVrms] = useState<number | null>(28.284);

  const load =
    z !== null && z > 0
      ? computeLoad(z, {
          connection,
          seriesCount: series ?? 1,
          parallelCount: parallel ?? 1,
        })
      : null;
  const perSpeaker = ampVrms !== null && load ? ampVrms * load.voltageDivider : null;

  return (
    <Card title={t('quick.load')}>
      <div className="grid">
        <PlainNumberField label={t('ls.nominalImpedance')} value={z} onChange={setZ} unit="ohm" />
        <SelectField<SpeakerConnection>
          label={t('quick.connection')}
          value={connection}
          onChange={setConnection}
          options={[
            { value: 'single', label: '1 x' },
            { value: 'parallel', label: 'Parallel' },
            { value: 'series', label: 'Series' },
            { value: 'series-parallel', label: 'Series-parallel' },
          ]}
        />
        <PlainNumberField label={t('quick.seriesCount')} value={series} onChange={setSeries} step="1" />
        <PlainNumberField label={t('quick.parallelCount')} value={parallel} onChange={setParallel} step="1" />
        <PlainNumberField label={t('quick.vout')} value={ampVrms} onChange={setAmpVrms} unit="Vrms" />
      </div>
      {load && (
        <>
          <div className="grid">
            <ValueView label={t('quick.totalLoad')} value={load.totalImpedance} decimals={3} />
            <ValueView
              label={t('quick.perSpeakerVoltage')}
              value={
                perSpeaker === null
                  ? unknown('Vrms', 'rms', t('err.required'))
                  : tracked(perSpeaker, 'Vrms', 'rms', 'calculated', 'medium', {
                      formula: `Vspeaker = Vamp / seriesCount = ${ampVrms} / ${Math.max(1, series ?? 1)}`,
                    })
              }
            />
            <ValueView
              label={`${t('quick.power')} / ${t('chain.loudspeaker')}`}
              value={
                perSpeaker === null || z === null
                  ? unknown('W', 'power', t('err.required'))
                  : tracked(powerFromVrms(perSpeaker, z), 'W', 'power', 'calculated', 'medium', {
                      formula: `P = Vrms^2 / R = (${fmt(perSpeaker, 4)})^2 / ${z}`,
                      notes: [t('quick.nominalWarning')],
                    })
              }
            />
          </div>
          <p className="tiny faint">
            {load.count} x {t('chain.loudspeaker')} ·{' '}
            {t('quick.perSpeakerVoltage')}: {fmtSigned(ratioToDb(load.voltageDivider), 2)} dB
          </p>
          {load.notes.map((n, i) => (
            <Notice key={i} kind="warn">
              {n}
            </Notice>
          ))}
        </>
      )}
    </Card>
  );
}
