import {
  Card,
  ChannelPicker,
  Empty,
  Notice,
  NoProject,
  PageHead,
  fmt,
} from '../components';
import { useStore } from '../../state/store';
import { PARAMETERS, crestFactorEffect, timingReference } from '../../engine';
import { TranslationKey } from '../../i18n';

export function Dynamics() {
  const { t, project, channel } = useStore();

  const loudspeaker = project?.loudspeakers.find((l) => l.id === channel?.loudspeakerId) ?? null;
  const dsp = project?.dsps.find((d) => d.id === channel?.dspId) ?? null;

  return (
    <>
      <PageHead title={t('dyn.title')} sub={t('dyn.subtitle')} />
      <Notice kind="warn">{t('dyn.educational')}</Notice>

      <Card title={t('dyn.parameters')}>
        {PARAMETERS.map((p) => (
          <div className="list-item" key={p.id}>
            <div className="item-title">
              {t(`dyn.p.${p.key}` as TranslationKey) !== `dyn.p.${p.key}`
                ? t(`dyn.p.${p.key}` as TranslationKey)
                : p.key}{' '}
              <span className="faint mono tiny">{p.unit}</span>
            </div>
            <p className="small muted" style={{ marginBottom: 4 }}>
              {t(`dyn.p.${p.key}.what` as TranslationKey)}
            </p>
            <p className="small" style={{ margin: 0 }}>
              <strong>{t('dyn.effect')}:</strong> {t(`dyn.p.${p.key}.effect` as TranslationKey)}
            </p>
          </div>
        ))}
      </Card>

      {!project ? (
        <NoProject />
      ) : !channel ? (
        <Empty text={t('g.noChannels')} />
      ) : (
        <>
          <ChannelPicker />
          {!dsp ? (
            <Empty text={t('wiz.noChannel')} />
          ) : (
            dsp.limiters.map((lim) => {
              const ref = timingReference({
                limiterType: lim.type,
                domain: lim.protects,
                lowerCutoffHz: loudspeaker?.lowerCutoffHz.value ?? loudspeaker?.freqRangeLowHz.value ?? null,
                upperCutoffHz: loudspeaker?.freqRangeHighHz.value ?? null,
                detectionMode: lim.detectionMode,
                band: channel.band,
              });
              return (
                <Card
                  key={lim.id}
                  title={`${t(`dsp.type.${lim.type}` as TranslationKey)} — ${t(
                    `domain.${lim.protects}` as TranslationKey,
                  )}`}
                >
                  <h3>{t('dyn.enteredSettings')}</h3>
                  <div className="table-wrap">
                    <table>
                      <tbody>
                        <Row label={t('dsp.attack')} v={lim.attackMs.value} u="ms" />
                        <Row label={t('dsp.release')} v={lim.releaseMs.value} u="ms" />
                        <Row label={t('dsp.hold')} v={lim.holdMs.value} u="ms" />
                        <Row label={t('dsp.ratio')} v={lim.ratio.value} u=":1" />
                        <Row label={t('dsp.knee')} v={lim.kneeDb.value} u="dB" />
                        <Row label={t('dsp.lookahead')} v={lim.lookaheadMs.value} u="ms" />
                        <Row label={t('dsp.rmsIntegration')} v={lim.rmsIntegrationMs.value} u="ms" />
                      </tbody>
                    </table>
                  </div>

                  {lim.manufacturerRecommendation && (
                    <Notice kind="ok">
                      <strong>{t('dsp.recommendation')}:</strong> {lim.manufacturerRecommendation}
                    </Notice>
                  )}

                  <h3>{t('dyn.timing')}</h3>
                  <div className="table-wrap">
                    <table>
                      <tbody>
                        <Row label={t('dyn.period')} v={ref.periodMs} u="ms" />
                        <tr>
                          <th>{t('dyn.attackRange')}</th>
                          <td className="num">
                            {ref.attackRangeMs
                              ? `${fmt(ref.attackRangeMs[0], 2)} – ${fmt(ref.attackRangeMs[1], 2)} ms`
                              : '—'}
                          </td>
                        </tr>
                        <tr>
                          <th>{t('dyn.releaseRange')}</th>
                          <td className="num">
                            {ref.releaseRangeMs
                              ? `${fmt(ref.releaseRangeMs[0], 1)} – ${fmt(ref.releaseRangeMs[1], 1)} ms`
                              : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {ref.guidanceKeys.length > 0 && (
                    <ul className="small muted">
                      {Array.from(new Set(ref.guidanceKeys)).map((k) => (
                        <li key={k}>{t(`dyn.g.${k}` as TranslationKey)}</li>
                      ))}
                    </ul>
                  )}

                  <h3>{t('dyn.caveats')}</h3>
                  <div className="notice warn">
                    <ul>
                      {ref.caveats.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  {channel.assumedCrestFactorDb !== null && (
                    <Notice kind="info">
                      <strong>{t('dyn.crestEffect')}:</strong>{' '}
                      {crestFactorEffect(channel.assumedCrestFactorDb).note}
                    </Notice>
                  )}
                </Card>
              );
            })
          )}
        </>
      )}
    </>
  );
}

function Row({ label, v, u }: { label: string; v: number | null; u: string }) {
  const { t } = useStore();
  return (
    <tr>
      <th>{label}</th>
      <td className="num">{v === null ? t('g.notSet') : `${fmt(v, 2)} ${u}`}</td>
    </tr>
  );
}
