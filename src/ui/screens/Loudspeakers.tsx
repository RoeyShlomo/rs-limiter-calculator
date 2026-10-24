import { Card, Empty, Notice, NoProject, NumberField, PageHead, SelectField, TextField, ValueView } from '../components';
import { useStore } from '../../state/store';
import {
  Loudspeaker,
  PeakPowerInterpretation,
  isKnown,
  loudspeakerLimits,
  newLoudspeaker,
} from '../../engine';
import { TranslationKey } from '../../i18n';

export function Loudspeakers() {
  const { t, project, upsertLoudspeaker, removeLoudspeaker, library, setLibrary } = useStore();
  if (!project) return <><PageHead title={t('ls.title')} sub={t('ls.subtitle')} /><NoProject /></>;

  return (
    <>
      <PageHead title={t('ls.title')} sub={t('ls.subtitle')} />
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="primary" onClick={() => upsertLoudspeaker(newLoudspeaker())}>
          {t('ls.new')}
        </button>
      </div>
      {project.loudspeakers.length === 0 && <Empty text={t('ls.empty')} />}
      {project.loudspeakers.map((ls) => (
        <LoudspeakerEditor
          key={ls.id}
          ls={ls}
          onChange={upsertLoudspeaker}
          onDelete={() => removeLoudspeaker(ls.id)}
          onSaveProfile={() =>
            setLibrary({ ...library, loudspeakers: [...library.loudspeakers.filter((x) => x.id !== ls.id), ls] })
          }
        />
      ))}
    </>
  );
}

function LoudspeakerEditor({
  ls,
  onChange,
  onDelete,
  onSaveProfile,
}: {
  ls: Loudspeaker;
  onChange: (l: Loudspeaker) => void;
  onDelete: () => void;
  onSaveProfile: () => void;
}) {
  const { t } = useStore();
  const set = <K extends keyof Loudspeaker>(key: K, value: Loudspeaker[K]) => onChange({ ...ls, [key]: value });
  const limits = loudspeakerLimits(ls, { connection: 'single', seriesCount: 1, parallelCount: 1 });

  return (
    <Card
      title={`${ls.manufacturer || t('g.manufacturer')} ${ls.model || t('g.model')}`}
      actions={
        <div className="row">
          <button className="small" onClick={onSaveProfile}>
            {t('prof.saveLs')}
          </button>
          <button className="small danger" onClick={onDelete}>
            {t('g.delete')}
          </button>
        </div>
      }
    >
      <div className="grid">
        <TextField label={t('g.manufacturer')} value={ls.manufacturer} onChange={(v) => set('manufacturer', v)} />
        <TextField label={t('g.model')} value={ls.model} onChange={(v) => set('model', v)} />
        <SelectField
          label={t('ls.band')}
          value={ls.band}
          onChange={(v) => set('band', v)}
          options={(['sub', 'low', 'mid', 'high', 'full'] as Loudspeaker['band'][]).map((b) => ({
            value: b,
            label: t(`ls.band.${b}` as TranslationKey),
          }))}
        />
      </div>

      <h3>Impedance</h3>
      <div className="grid">
        <NumberField
          label={t('ls.nominalImpedance')}
          unit="ohm"
          entry={ls.nominalImpedance}
          onChange={(e) => set('nominalImpedance', e)}
        />
        <NumberField
          label={t('ls.minimumImpedance')}
          unit="ohm"
          entry={ls.minimumImpedance}
          onChange={(e) => set('minimumImpedance', e)}
          hint={t('g.optional')}
        />
      </div>

      <h3>Power ratings</h3>
      <div className="grid">
        <NumberField label={t('ls.aesPower')} unit="W" entry={ls.aesPower} onChange={(e) => set('aesPower', e)} />
        <NumberField
          label={t('ls.continuousPower')}
          unit="W"
          entry={ls.continuousPower}
          onChange={(e) => set('continuousPower', e)}
        />
        <NumberField
          label={t('ls.programPower')}
          unit="W"
          entry={ls.programPower}
          onChange={(e) => set('programPower', e)}
        />
        <NumberField label={t('ls.peakPower')} unit="W" entry={ls.peakPower} onChange={(e) => set('peakPower', e)} />
        <SelectField<PeakPowerInterpretation>
          label={t('ls.peakInterpretation')}
          value={ls.peakPowerInterpretation}
          onChange={(v) => set('peakPowerInterpretation', v)}
          options={(['unknown', 'peak-voltage', 'rms-equivalent'] as PeakPowerInterpretation[]).map((p) => ({
            value: p,
            label: t(`ls.peakInterp.${p}` as TranslationKey),
          }))}
        />
      </div>

      <h3>Published voltage limits</h3>
      <Notice kind="info">
        A published voltage limit needs no impedance assumption, so it always outranks a power-derived figure.
      </Notice>
      <div className="grid">
        <NumberField
          label={t('ls.publishedRms')}
          unit="Vrms"
          entry={ls.publishedRmsVoltage}
          onChange={(e) => set('publishedRmsVoltage', e)}
        />
        <NumberField
          label={t('ls.publishedPeak')}
          unit="Vpeak"
          entry={ls.publishedPeakVoltage}
          onChange={(e) => set('publishedPeakVoltage', e)}
        />
      </div>

      <h3>Frequency and mechanical limits</h3>
      <div className="grid">
        <NumberField label={t('ls.freqLow')} unit="Hz" entry={ls.freqRangeLowHz} onChange={(e) => set('freqRangeLowHz', e)} />
        <NumberField label={t('ls.freqHigh')} unit="Hz" entry={ls.freqRangeHighHz} onChange={(e) => set('freqRangeHighHz', e)} />
        <NumberField
          label={t('ls.lowerCutoff')}
          unit="Hz"
          entry={ls.lowerCutoffHz}
          onChange={(e) => set('lowerCutoffHz', e)}
        />
        <NumberField label={t('ls.xmax')} unit="mm" entry={ls.xmaxMm} onChange={(e) => set('xmaxMm', e)} />
      </div>
      <TextField
        label={t('ls.mechanicalNotes')}
        value={ls.mechanicalNotes}
        onChange={(v) => set('mechanicalNotes', v)}
        multiline
      />

      <h3>{t('ls.dataQuality')}</h3>
      <Notice kind={isKnown(limits.rmsPerSpeaker) ? 'ok' : 'warn'}>
        {isKnown(limits.rmsPerSpeaker) ? t('ls.thermalOk') : t('ls.thermalNo')}
      </Notice>
      <Notice kind={isKnown(limits.peakPerSpeaker) ? 'ok' : 'warn'}>
        {isKnown(limits.peakPerSpeaker) ? t('ls.peakOk') : t('ls.peakNo')}
      </Notice>
      <div className="grid">
        <ValueView label={t('calc.rmsVoltageLimit')} value={limits.rmsPerSpeaker} />
        <ValueView label={t('calc.peakVoltageLimit')} value={limits.peakPerSpeaker} />
        <ValueView label={t('calc.equivalentPower')} value={limits.equivalentPower} decimals={1} />
      </div>
    </Card>
  );
}
