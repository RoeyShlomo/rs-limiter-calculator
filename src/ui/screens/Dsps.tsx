import {
  Card,
  Empty,
  Notice,
  NoProject,
  NumberField,
  PageHead,
  SelectField,
  TextField,
} from '../components';
import { useStore } from '../../state/store';
import {
  DbfsConvention,
  DetectionMode,
  DspDevice,
  LimiterStage,
  LimiterType,
  ProtectionDomain,
  ThresholdScale,
  newDsp,
  newLimiterStage,
} from '../../engine';
import { TranslationKey } from '../../i18n';

const SCALES: ThresholdScale[] = ['dBu', 'dBV', 'dBFS', 'dB-relative', 'Vrms', 'Vpeak', 'W', 'manufacturer-defined'];

export function Dsps() {
  const { t, project, upsertDsp, removeDsp, settings, library, setLibrary } = useStore();
  if (!project) return <><PageHead title={t('dsp.title')} sub={t('dsp.subtitle')} /><NoProject /></>;

  return (
    <>
      <PageHead title={t('dsp.title')} sub={t('dsp.subtitle')} />
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="primary" onClick={() => upsertDsp(newDsp({ dbfsConvention: settings.defaultConvention }))}>
          {t('dsp.new')}
        </button>
      </div>
      {project.dsps.length === 0 && <Empty text={t('dsp.empty')} />}
      {project.dsps.map((dsp) => (
        <DspEditor
          key={dsp.id}
          dsp={dsp}
          onChange={upsertDsp}
          onDelete={() => removeDsp(dsp.id)}
          onSaveProfile={() => setLibrary({ ...library, dsps: [...library.dsps.filter((x) => x.id !== dsp.id), dsp] })}
        />
      ))}
    </>
  );
}

function DspEditor({
  dsp,
  onChange,
  onDelete,
  onSaveProfile,
}: {
  dsp: DspDevice;
  onChange: (d: DspDevice) => void;
  onDelete: () => void;
  onSaveProfile: () => void;
}) {
  const { t } = useStore();
  const set = <K extends keyof DspDevice>(key: K, value: DspDevice[K]) => onChange({ ...dsp, [key]: value });
  const setLimiter = (id: string, patch: Partial<LimiterStage>) =>
    set('limiters', dsp.limiters.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <Card
      title={`${dsp.manufacturer || t('g.manufacturer')} ${dsp.model || t('g.model')}`}
      actions={
        <div className="row">
          <button className="small" onClick={onSaveProfile}>
            {t('prof.saveDsp')}
          </button>
          <button className="small danger" onClick={onDelete}>
            {t('g.delete')}
          </button>
        </div>
      }
    >
      <div className="grid">
        <TextField label={t('g.manufacturer')} value={dsp.manufacturer} onChange={(v) => set('manufacturer', v)} />
        <TextField label={t('g.model')} value={dsp.model} onChange={(v) => set('model', v)} />
      </div>

      <h3>Level reference</h3>
      <Notice kind={dsp.dbfsConvention === 'unknown' ? 'danger' : 'info'}>{t('dsp.conventionHelp')}</Notice>
      <div className="grid">
        <SelectField<DbfsConvention>
          label={t('dsp.convention')}
          value={dsp.dbfsConvention}
          onChange={(v) => set('dbfsConvention', v)}
          options={(['unknown', 'aes17', 'peak-referenced'] as DbfsConvention[]).map((c) => ({
            value: c,
            label: t(`dsp.convention.${c}` as TranslationKey),
          }))}
        />
        <NumberField
          label={t('dsp.analogFs')}
          unit="dBu"
          entry={dsp.analogFullScaleDbu}
          onChange={(e) => set('analogFullScaleDbu', e)}
          hint={t('dsp.analogFsHelp')}
        />
        <NumberField
          label={t('dsp.relativeRef')}
          unit="dBu"
          entry={dsp.relativeReferenceDbu}
          onChange={(e) => set('relativeReferenceDbu', e)}
          hint={t('dsp.scaleHelp')}
        />
      </div>

      <h3>{t('dsp.limiters')}</h3>
      {dsp.limiters.map((lim) => (
        <div className="list-item" key={lim.id}>
          <div className="spread">
            <div className="item-title">
              {t(`dsp.type.${lim.type}` as TranslationKey)} → {t(`domain.${lim.protects}` as TranslationKey)}
            </div>
            <button
              className="small danger"
              onClick={() => set('limiters', dsp.limiters.filter((l) => l.id !== lim.id))}
            >
              {t('g.delete')}
            </button>
          </div>

          <div className="grid">
            <SelectField<LimiterType>
              label={t('dsp.limiterType')}
              value={lim.type}
              onChange={(v) => setLimiter(lim.id, { type: v })}
              options={(['rms', 'peak', 'clip', 'compressor', 'single-unspecified'] as LimiterType[]).map((x) => ({
                value: x,
                label: t(`dsp.type.${x}` as TranslationKey),
              }))}
            />
            <SelectField<ProtectionDomain>
              label={t('dsp.protects')}
              value={lim.protects}
              onChange={(v) => setLimiter(lim.id, { protects: v })}
              options={(['thermal', 'peak', 'clip'] as ProtectionDomain[]).map((x) => ({
                value: x,
                label: t(`domain.${x}` as TranslationKey),
              }))}
            />
            <SelectField<ThresholdScale>
              label={t('dsp.thresholdScale')}
              value={lim.thresholdScale}
              onChange={(v) => setLimiter(lim.id, { thresholdScale: v })}
              options={SCALES.map((s) => ({ value: s, label: s }))}
              hint={t('dsp.scaleHelp')}
            />
            {(lim.protects === 'peak' || lim.type === 'peak') && (
              <SelectField<LimiterStage['peakThresholdReference']>
                label={t('dsp.peakReference')}
                value={lim.peakThresholdReference}
                onChange={(v) => setLimiter(lim.id, { peakThresholdReference: v })}
                options={(['unknown', 'peak', 'rms-of-sine'] as LimiterStage['peakThresholdReference'][]).map((x) => ({
                  value: x,
                  label: t(`dsp.peakRef.${x}` as TranslationKey),
                }))}
                hint={t('dsp.peakRefHelp')}
              />
            )}
          </div>

          <div className="grid">
            <NumberField label={t('dsp.attack')} unit="ms" entry={lim.attackMs} onChange={(e) => setLimiter(lim.id, { attackMs: e })} />
            <NumberField label={t('dsp.release')} unit="ms" entry={lim.releaseMs} onChange={(e) => setLimiter(lim.id, { releaseMs: e })} />
            <NumberField label={t('dsp.hold')} unit="ms" entry={lim.holdMs} onChange={(e) => setLimiter(lim.id, { holdMs: e })} />
            <NumberField label={t('dsp.ratio')} unit="x" entry={lim.ratio} onChange={(e) => setLimiter(lim.id, { ratio: e })} />
            <NumberField label={t('dsp.knee')} unit="dB" entry={lim.kneeDb} onChange={(e) => setLimiter(lim.id, { kneeDb: e })} />
            <NumberField
              label={t('dsp.lookahead')}
              unit="ms"
              entry={lim.lookaheadMs}
              onChange={(e) => setLimiter(lim.id, { lookaheadMs: e })}
            />
            <SelectField<DetectionMode>
              label={t('dsp.detection')}
              value={lim.detectionMode}
              onChange={(v) => setLimiter(lim.id, { detectionMode: v })}
              options={(['unknown', 'rms', 'peak', 'hybrid'] as DetectionMode[]).map((x) => ({
                value: x,
                label: t(`dsp.detection.${x}` as TranslationKey),
              }))}
            />
            <NumberField
              label={t('dsp.rmsIntegration')}
              unit="ms"
              entry={lim.rmsIntegrationMs}
              onChange={(e) => setLimiter(lim.id, { rmsIntegrationMs: e })}
            />
          </div>

          <TextField
            label={t('dsp.recommendation')}
            value={lim.manufacturerRecommendation}
            onChange={(v) => setLimiter(lim.id, { manufacturerRecommendation: v })}
            hint={t('dsp.recommendationHelp')}
            multiline
          />
        </div>
      ))}
      <button className="small" onClick={() => set('limiters', [...dsp.limiters, newLimiterStage()])}>
        {t('dsp.addLimiter')}
      </button>
    </Card>
  );
}
