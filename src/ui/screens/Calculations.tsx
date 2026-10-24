import {
  Card,
  ChannelPicker,
  Empty,
  MissingList,
  Notice,
  NoProject,
  PageHead,
  ValueView,
  VerifiedBadge,
  WarningList,
  fmt,
  fmtSigned,
} from '../components';
import { useStore } from '../../state/store';
import { DomainAnalysis, ProtectionDomain, isKnown, tracked, unknown } from '../../engine';
import { useAnalysis } from '../useAnalysis';
import { TranslationKey } from '../../i18n';

export function Calculations() {
  const { t, project } = useStore();
  const a = useAnalysis();

  if (!project) return <><PageHead title={t('calc.title')} sub={t('calc.subtitle')} /><NoProject /></>;
  if (!project.channels.length)
    return (
      <>
        <PageHead title={t('calc.title')} sub={t('calc.subtitle')} />
        <Empty text={t('g.noChannels')} />
      </>
    );

  return (
    <>
      <PageHead title={t('calc.title')} sub={t('calc.subtitle')} />
      <ChannelPicker />
      {!a ? (
        <Empty text={t('g.noChannels')} />
      ) : (
        <>
          <Notice kind="warn">{t('calc.notComplete')}</Notice>
          {a.blocked && <Notice kind="danger">{t('calc.blocked')}</Notice>}
          <MissingList missing={a.missing} />
          <WarningList warnings={a.warnings} />

          {a.speaker && (
            <Card title={t('calc.speakerLimits')}>
              <div className="grid">
                <ValueView label={`${t('calc.rmsVoltageLimit')} (per loudspeaker)`} value={a.speaker.rmsPerSpeaker} />
                <ValueView label={`${t('calc.peakVoltageLimit')} (per loudspeaker)`} value={a.speaker.peakPerSpeaker} />
                <ValueView label={`${t('calc.rmsVoltageLimit')} (at amplifier)`} value={a.speaker.rmsAtAmplifier} />
                <ValueView label={t('calc.equivalentPower')} value={a.speaker.equivalentPower} decimals={1} />
                <ValueView label={t('calc.totalLoad')} value={a.speaker.load.totalImpedance} decimals={2} />
              </div>
            </Card>
          )}

          {a.amp && (
            <Card title={t('calc.ampLimits')}>
              <div className="grid">
                <ValueView label={t('calc.maxOutputVoltage')} value={a.amp.maxOutputVrms} />
                <ValueView label={`${t('calc.maxOutputVoltage')} (Vpeak)`} value={a.amp.maxOutputVpeak} />
                <ValueView label={t('calc.gain')} value={a.amp.gainDb} />
                <ValueView label={t('calc.maxSafeInput')} value={a.amp.maxSafeInputDbu} />
              </div>
            </Card>
          )}

          <Card title={t('calc.dspSettings')}>
            {(['thermal', 'peak', 'clip'] as ProtectionDomain[]).map((d) => (
              <DomainCard key={d} d={a.domains[d]} headroom={headroomFor(a.domains[d], a)} />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function headroomFor(d: DomainAnalysis, a: NonNullable<ReturnType<typeof useAnalysis>>) {
  if (!a.amp || !isKnown(a.amp.maxSafeInputDbu) || !isKnown(d.requiredDspOutputDbu)) {
    return unknown('dB', 'ratio', 'Needs a maximum safe input level and a required DSP output level.');
  }
  if (d.requiredDspOutputDbu.unit !== 'dBu') {
    return unknown('dB', 'ratio', 'Headroom is an RMS-domain figure and is not stated for a peak target.');
  }
  const v = a.amp.maxSafeInputDbu.value - d.requiredDspOutputDbu.value;
  return tracked(v, 'dB', 'ratio', 'calculated', a.amp.maxSafeInputDbu.certainty, {
    formula:
      `Headroom = Maximum Safe Input Level - Required DSP Output Level = ` +
      `${fmt(a.amp.maxSafeInputDbu.value, 3)} - ${fmt(d.requiredDspOutputDbu.value, 3)}`,
    sources: ['Maximum safe input level', 'Required DSP output level'],
    notes: [
      v < 0
        ? 'NEGATIVE headroom: the level needed to reach the protection target is above the level that ' +
          'clips the amplifier. The amplifier clips before the protection target is reached.'
        : 'Level still available at the amplifier input above the protection target, before the amplifier clips.',
    ],
  });
}

function DomainCard({ d, headroom }: { d: DomainAnalysis; headroom: ReturnType<typeof headroomFor> }) {
  const { t } = useStore();
  return (
    <div className="list-item">
      <div className="spread" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{t(`domain.${d.domain}` as TranslationKey)}</h3>
        <div className="chips">
          <VerifiedBadge verified={d.fieldVerified} />
          <span className="badge tiny">
            {t('calc.safetyMargin')}: {fmtSigned(d.marginDb, 2)} dB
          </span>
        </div>
      </div>

      {!isKnown(d.threshold) && <Notice kind="danger">{t('calc.noThreshold')}</Notice>}
      <WarningList warnings={d.warnings} />
      <MissingList missing={d.missing} />

      <p className="small muted">
        {t('calc.governedBy')}: <strong>{t(`calc.governedBy.${d.governedBy}` as TranslationKey)}</strong>
      </p>

      <div className="grid">
        <ValueView label={t('calc.limitBefore')} value={d.limitAtAmplifier} />
        <ValueView label={t('calc.target')} value={d.targetAtAmplifier} />
        <ValueView label={t('calc.equivalentPower')} value={d.equivalentPower} decimals={1} />
        <ValueView label={t('calc.requiredDsp')} value={d.requiredDspOutputDbu} />
        <ValueView label={t('calc.atLimiter')} value={d.thresholdAtLimiterDbu} />
        <ValueView label={t('calc.threshold')} value={d.threshold} emphasis decimals={2} />
        <ValueView label={t('calc.headroom')} value={headroom} decimals={2} />
      </div>

      {d.candidates.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="small">{t('calc.candidates')}</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('g.sources')}</th>
                  <th className="num">{t('g.value')}</th>
                  <th>{t('g.status')}</th>
                </tr>
              </thead>
              <tbody>
                {d.candidates.map((c, i) => (
                  <tr key={i}>
                    <td>{c.source}</td>
                    <td className="num">
                      {isKnown(c.value) ? `${fmt(c.value.value, 3)} ${c.value.unit}` : t('g.notSet')}
                    </td>
                    <td>{t(`status.${c.value.status}` as TranslationKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {d.alternates.some((x) => isKnown(x.value)) && (
        <details style={{ marginTop: 8 }}>
          <summary className="small">{t('calc.alternates')}</summary>
          <div className="grid" style={{ marginTop: 8 }}>
            {d.alternates
              .filter((x) => isKnown(x.value))
              .map((x, i) => (
                <ValueView key={i} label={x.scale} value={x.value} decimals={3} />
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
