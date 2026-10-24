import {
  Card,
  Checkbox,
  Empty,
  Notice,
  NoProject,
  NumberField,
  PageHead,
  SelectField,
  TextField,
  ValueView,
  WarningList,
  fmt,
} from '../components';
import { useStore } from '../../state/store';
import {
  Amplifier,
  AmpMode,
  SensitivityUnit,
  analyzeAmplifier,
  isKnown,
  newAmplifier,
  ratingForLoad,
  tracked,
  unknown,
  inputVrmsForOutput,
  vrmsFromPower,
  vrmsToDbu,
} from '../../engine';
import { TranslationKey } from '../../i18n';

export function Amplifiers() {
  const { t, project, upsertAmplifier, removeAmplifier, library, setLibrary } = useStore();
  if (!project) return <><PageHead title={t('amp.title')} sub={t('amp.subtitle')} /><NoProject /></>;

  return (
    <>
      <PageHead title={t('amp.title')} sub={t('amp.subtitle')} />
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="primary" onClick={() => upsertAmplifier(newAmplifier())}>
          {t('amp.new')}
        </button>
      </div>
      {project.amplifiers.length === 0 && <Empty text={t('amp.empty')} />}
      {project.amplifiers.map((amp) => (
        <AmplifierEditor
          key={amp.id}
          amp={amp}
          onChange={upsertAmplifier}
          onDelete={() => removeAmplifier(amp.id)}
          onSaveProfile={() =>
            setLibrary({ ...library, amplifiers: [...library.amplifiers.filter((x) => x.id !== amp.id), amp] })
          }
        />
      ))}
    </>
  );
}

function AmplifierEditor({
  amp,
  onChange,
  onDelete,
  onSaveProfile,
}: {
  amp: Amplifier;
  onChange: (a: Amplifier) => void;
  onDelete: () => void;
  onSaveProfile: () => void;
}) {
  const { t } = useStore();
  const set = <K extends keyof Amplifier>(key: K, value: Amplifier[K]) => onChange({ ...amp, [key]: value });
  const refLoad = amp.sensitivityLoadOhm.value ?? amp.ratings[0]?.impedanceOhm ?? null;
  const analysis = analyzeAmplifier(amp, refLoad);

  // Reverse conversion: the sensitivity implied by a published voltage gain.
  const rating = refLoad !== null ? ratingForLoad(amp, refLoad) : null;
  const ratedVout = rating ? vrmsFromPower(rating.powerW, rating.impedanceOhm) : null;
  const impliedSensitivity =
    ratedVout !== null && isKnown(analysis.gainDb)
      ? inputVrmsForOutput(ratedVout, analysis.gainDb.value)
      : null;

  return (
    <Card
      title={`${amp.manufacturer || t('g.manufacturer')} ${amp.model || t('g.model')}`}
      actions={
        <div className="row">
          <button className="small" onClick={onSaveProfile}>
            {t('prof.saveAmp')}
          </button>
          <button className="small danger" onClick={onDelete}>
            {t('g.delete')}
          </button>
        </div>
      }
    >
      <div className="grid">
        <TextField label={t('g.manufacturer')} value={amp.manufacturer} onChange={(v) => set('manufacturer', v)} />
        <TextField label={t('g.model')} value={amp.model} onChange={(v) => set('model', v)} />
        <SelectField<AmpMode>
          label={t('amp.mode')}
          value={amp.mode}
          onChange={(v) => set('mode', v)}
          options={(['stereo', 'bridge', 'parallel'] as AmpMode[]).map((m) => ({
            value: m,
            label: t(`amp.mode.${m}` as TranslationKey),
          }))}
        />
      </div>

      <h3>{t('amp.ratings')}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('quick.impedance')} (ohm)</th>
              <th>{t('quick.power')} (W)</th>
              <th className="num">Vrms = sqrt(P x R)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {amp.ratings.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="number"
                    value={r.impedanceOhm}
                    onChange={(e) =>
                      set(
                        'ratings',
                        amp.ratings.map((x, j) => (j === i ? { ...x, impedanceOhm: Number(e.target.value) } : x)),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={r.powerW}
                    onChange={(e) =>
                      set(
                        'ratings',
                        amp.ratings.map((x, j) => (j === i ? { ...x, powerW: Number(e.target.value) } : x)),
                      )
                    }
                  />
                </td>
                <td className="num">{fmt(vrmsFromPower(r.powerW, r.impedanceOhm), 2)}</td>
                <td>
                  <button
                    className="small danger"
                    onClick={() => set('ratings', amp.ratings.filter((_, j) => j !== i))}
                  >
                    {t('g.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="small"
        onClick={() => set('ratings', [...amp.ratings, { impedanceOhm: 8, powerW: 1000, status: 'manufacturer' }])}
      >
        {t('amp.addRating')}
      </button>

      <h3>Gain and sensitivity</h3>
      <Notice kind="info">{t('amp.subtitle')}</Notice>
      <div className="grid">
        <NumberField label={t('amp.voltageGain')} unit="dB" entry={amp.voltageGainDb} onChange={(e) => set('voltageGainDb', e)} />
        <NumberField
          label={t('amp.inputSensitivity')}
          unit={amp.sensitivityUnit}
          entry={amp.inputSensitivity}
          onChange={(e) => set('inputSensitivity', e)}
        />
        <SelectField<SensitivityUnit>
          label={`${t('amp.inputSensitivity')} — ${t('g.unit')}`}
          value={amp.sensitivityUnit}
          onChange={(v) => set('sensitivityUnit', v)}
          options={[
            { value: 'Vrms', label: 'Vrms' },
            { value: 'dBu', label: 'dBu' },
            { value: 'dBV', label: 'dBV' },
          ]}
        />
        <NumberField
          label={t('amp.sensitivityLoad')}
          unit="ohm"
          entry={amp.sensitivityLoadOhm}
          onChange={(e) => set('sensitivityLoadOhm', e)}
        />
      </div>

      <h3>Limits</h3>
      <div className="grid">
        <NumberField
          label={t('amp.maxOutput')}
          unit={amp.maxOutputVoltageIsPeak ? 'Vpeak' : 'Vrms'}
          entry={amp.maxOutputVoltage}
          onChange={(e) => set('maxOutputVoltage', e)}
        />
        <NumberField
          label={t('amp.maxInput')}
          unit={amp.maxInputLevelUnit}
          entry={amp.maxInputLevel}
          onChange={(e) => set('maxInputLevel', e)}
        />
        <SelectField<SensitivityUnit>
          label={`${t('amp.maxInput')} — ${t('g.unit')}`}
          value={amp.maxInputLevelUnit}
          onChange={(v) => set('maxInputLevelUnit', v)}
          options={[
            { value: 'Vrms', label: 'Vrms' },
            { value: 'dBu', label: 'dBu' },
            { value: 'dBV', label: 'dBV' },
          ]}
        />
        <NumberField label={t('amp.minLoad')} unit="ohm" entry={amp.minimumLoadOhm} onChange={(e) => set('minimumLoadOhm', e)} />
      </div>
      <Checkbox
        label={t('amp.maxOutputIsPeak')}
        checked={amp.maxOutputVoltageIsPeak}
        onChange={(v) => set('maxOutputVoltageIsPeak', v)}
      />

      <h3>Calibration conditions</h3>
      <div className="grid">
        <TextField
          label={t('amp.gainControl')}
          value={amp.gainControlPosition}
          onChange={(v) => set('gainControlPosition', v)}
          placeholder="e.g. fully clockwise, -6 dB detent"
        />
        <SelectField
          label={t('amp.internalLimiter')}
          value={amp.internalLimiter}
          onChange={(v) => set('internalLimiter', v)}
          options={(['none', 'active', 'unknown'] as Amplifier['internalLimiter'][]).map((x) => ({
            value: x,
            label: t(`amp.internalLimiter.${x}` as TranslationKey),
          }))}
        />
      </div>
      <TextField
        label={t('amp.internalLimiterNotes')}
        value={amp.internalLimiterNotes}
        onChange={(v) => set('internalLimiterNotes', v)}
        multiline
      />

      <h3>{t('amp.derived')}</h3>
      {!isKnown(analysis.gainDb) && <Notice kind="warn">{t('amp.noGainData')}</Notice>}
      <WarningList warnings={analysis.warnings} />
      <div className="grid">
        <ValueView label={t('amp.derivedGain')} value={analysis.gainDb} />
        <ValueView label={t('amp.derivedMaxOut')} value={analysis.maxOutputVrms} />
        <ValueView label={`${t('amp.derivedMaxOut')} (Vpeak)`} value={analysis.maxOutputVpeak} />
        <ValueView label={t('amp.derivedMaxIn')} value={analysis.maxSafeInputDbu} />
        <ValueView
          label={t('amp.derivedSensitivity')}
          value={
            impliedSensitivity === null
              ? unknown('Vrms', 'rms', 'Needs a voltage gain and a rated power at a stated load.')
              : tracked(impliedSensitivity, 'Vrms', 'rms', 'calculated', analysis.gainDb.certainty, {
                  formula:
                    `Vin = Vout(rated) / 10^(Voltage Gain / 20) = ${fmt(ratedVout, 3)} / 10^(` +
                    `${fmt(analysis.gainDb.value, 3)} / 20)`,
                  sources: ['Voltage gain', 'Rated power at the reference load'],
                  notes: [
                    `Equivalent to ${fmt(vrmsToDbu(impliedSensitivity), 2)} dBu. This is the reverse of the ` +
                      'sensitivity-to-gain conversion and returns the published sensitivity when both are entered.',
                  ],
                })
          }
        />
      </div>
    </Card>
  );
}
