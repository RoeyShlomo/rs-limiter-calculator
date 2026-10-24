import {
  Card,
  ChannelPicker,
  Checkbox,
  Empty,
  Notice,
  NoProject,
  NumberField,
  PageHead,
  PlainNumberField,
  SelectField,
  TextField,
  ValueView,
  WarningList,
  fmt,
} from '../components';
import { useStore } from '../../state/store';
import {
  ChainStage,
  ChannelConfig,
  SpeakerConnection,
  StageKind,
  chainGains,
  uid,
} from '../../engine';
import { useAnalysis } from '../useAnalysis';
import { TranslationKey } from '../../i18n';

const KINDS: StageKind[] = ['source', 'dsp', 'gain', 'limiter', 'crossover', 'amplifier', 'loudspeaker'];

export function SignalChain() {
  const { t, project, channel, addChannel, updateChannel, removeChannel } = useStore();
  const analysis = useAnalysis();

  if (!project) return <><PageHead title={t('chain.title')} sub={t('chain.subtitle')} /><NoProject /></>;

  return (
    <>
      <PageHead title={t('chain.title')} sub={t('chain.subtitle')} />
      <Notice kind="info">{t('chain.multiway')}</Notice>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="primary" onClick={() => addChannel()}>
          {t('dash.addChannel')}
        </button>
      </div>
      {project.channels.length === 0 ? (
        <Empty text={t('g.noChannels')} />
      ) : (
        <>
          <ChannelPicker />
          {channel && (
            <ChannelEditor
              channel={channel}
              onChange={(patch) => updateChannel(channel.id, patch)}
              onDelete={() => removeChannel(channel.id)}
            />
          )}
          {analysis && (
            <Card title={t('chain.gain')}>
              <WarningList warnings={analysis.gains.warnings} />
              <div className="grid">
                <ValueView label={t('chain.preTotal')} value={analysis.gains.preLimiterDb} decimals={2} />
                <ValueView label={t('chain.postTotal')} value={analysis.gains.postLimiterDb} decimals={2} />
                {analysis.speaker && (
                  <ValueView label={t('calc.totalLoad')} value={analysis.speaker.load.totalImpedance} decimals={2} />
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

function ChannelEditor({
  channel,
  onChange,
  onDelete,
}: {
  channel: ChannelConfig;
  onChange: (patch: Partial<ChannelConfig>) => void;
  onDelete: () => void;
}) {
  const { t, project } = useStore();
  const gains = chainGains(channel.chain);

  const setStage = (id: string, patch: Partial<ChainStage>) =>
    onChange({ chain: channel.chain.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <>
      <Card
        title={channel.name}
        actions={
          <button className="small danger" onClick={onDelete}>
            {t('g.delete')}
          </button>
        }
      >
        <div className="grid">
          <TextField label={t('g.name')} value={channel.name} onChange={(v) => onChange({ name: v })} />
          <SelectField
            label={t('chain.band')}
            value={channel.band}
            onChange={(v) => onChange({ band: v })}
            options={(['sub', 'low', 'mid', 'high', 'full'] as ChannelConfig['band'][]).map((b) => ({
              value: b,
              label: t(`ls.band.${b}` as TranslationKey),
            }))}
          />
        </div>

        <h3>{t('chain.assignment')}</h3>
        <div className="grid">
          <SelectField
            label={t('chain.loudspeaker')}
            value={channel.loudspeakerId ?? ''}
            onChange={(v) => onChange({ loudspeakerId: v || null })}
            options={[
              { value: '', label: `— ${t('g.none')} —` },
              ...(project?.loudspeakers ?? []).map((l) => ({
                value: l.id,
                label: `${l.manufacturer} ${l.model}`.trim() || l.id,
              })),
            ]}
          />
          <SelectField
            label={t('chain.amplifier')}
            value={channel.amplifierId ?? ''}
            onChange={(v) => onChange({ amplifierId: v || null })}
            options={[
              { value: '', label: `— ${t('g.none')} —` },
              ...(project?.amplifiers ?? []).map((a) => ({
                value: a.id,
                label: `${a.manufacturer} ${a.model}`.trim() || a.id,
              })),
            ]}
          />
          <SelectField
            label={t('chain.dsp')}
            value={channel.dspId ?? ''}
            onChange={(v) => onChange({ dspId: v || null })}
            options={[
              { value: '', label: `— ${t('g.none')} —` },
              ...(project?.dsps ?? []).map((d) => ({
                value: d.id,
                label: `${d.manufacturer} ${d.model}`.trim() || d.id,
              })),
            ]}
          />
        </div>

        <h3>{t('chain.group')}</h3>
        <div className="grid">
          <SelectField<SpeakerConnection>
            label={t('quick.connection')}
            value={channel.group.connection}
            onChange={(v) => onChange({ group: { ...channel.group, connection: v } })}
            options={[
              { value: 'single', label: '1 x' },
              { value: 'parallel', label: 'Parallel' },
              { value: 'series', label: 'Series' },
              { value: 'series-parallel', label: 'Series-parallel' },
            ]}
          />
          <PlainNumberField
            label={t('quick.seriesCount')}
            value={channel.group.seriesCount}
            step="1"
            onChange={(v) => onChange({ group: { ...channel.group, seriesCount: v ?? 1 } })}
          />
          <PlainNumberField
            label={t('quick.parallelCount')}
            value={channel.group.parallelCount}
            step="1"
            onChange={(v) => onChange({ group: { ...channel.group, parallelCount: v ?? 1 } })}
          />
        </div>

        <h3>{t('chain.margins')}</h3>
        <Notice kind="warn">{t('chain.marginHelp')}</Notice>
        <div className="grid">
          <PlainNumberField
            label={t('chain.marginThermal')}
            unit="dB"
            value={channel.margins.thermalDb}
            onChange={(v) => onChange({ margins: { ...channel.margins, thermalDb: v ?? 0 } })}
          />
          <PlainNumberField
            label={t('chain.marginPeak')}
            unit="dB"
            value={channel.margins.peakDb}
            onChange={(v) => onChange({ margins: { ...channel.margins, peakDb: v ?? 0 } })}
          />
          <PlainNumberField
            label={t('chain.marginClip')}
            unit="dB"
            value={channel.margins.clipDb}
            onChange={(v) => onChange({ margins: { ...channel.margins, clipDb: v ?? 0 } })}
          />
          <PlainNumberField
            label={t('chain.crest')}
            unit="dB"
            value={channel.assumedCrestFactorDb}
            onChange={(v) => onChange({ assumedCrestFactorDb: v })}
            hint={t('quick.crestHint')}
          />
        </div>
      </Card>

      <Card title={t('chain.title')}>
        <p className="small muted">
          {t('chain.preTotal')}: <span className="mono">{fmt(gains.preLimiterDb.value, 2)} dB</span> ·{' '}
          {t('chain.postTotal')}: <span className="mono">{fmt(gains.postLimiterDb.value, 2)} dB</span>
        </p>
        {channel.chain.map((stage) => (
          <div className="list-item" key={stage.id}>
            <div className="grid">
              <TextField label={t('chain.stageLabel')} value={stage.label} onChange={(v) => setStage(stage.id, { label: v })} />
              <SelectField<StageKind>
                label={t('chain.kind')}
                value={stage.kind}
                onChange={(v) => setStage(stage.id, { kind: v })}
                options={KINDS.map((k) => ({ value: k, label: t(`chain.kind.${k}` as TranslationKey) }))}
              />
              <NumberField
                label={t('chain.gain')}
                unit="dB"
                entry={stage.gainDb}
                onChange={(e) => setStage(stage.id, { gainDb: e })}
              />
              <SelectField<ChainStage['position']>
                label={t('chain.position')}
                value={stage.position}
                onChange={(v) => setStage(stage.id, { position: v })}
                options={(['pre-limiter', 'post-limiter'] as ChainStage['position'][]).map((p) => ({
                  value: p,
                  label: t(`chain.position.${p}` as TranslationKey),
                }))}
              />
            </div>
            <div className="spread">
              <Checkbox
                label={t('chain.enabled')}
                checked={stage.enabled}
                onChange={(v) => setStage(stage.id, { enabled: v })}
              />
              <button
                className="small danger"
                onClick={() => onChange({ chain: channel.chain.filter((s) => s.id !== stage.id) })}
              >
                {t('g.delete')}
              </button>
            </div>
          </div>
        ))}
        <button
          className="small"
          onClick={() =>
            onChange({
              chain: [
                ...channel.chain,
                {
                  id: uid('stage'),
                  kind: 'gain',
                  label: t('chain.kind.gain'),
                  gainDb: { value: 0, unit: 'dB', status: 'manufacturer' },
                  position: 'post-limiter',
                  enabled: true,
                },
              ],
            })
          }
        >
          {t('chain.addStage')}
        </button>
      </Card>
    </>
  );
}
