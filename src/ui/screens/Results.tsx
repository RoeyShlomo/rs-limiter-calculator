import { useRef, useState } from 'react';
import {
  Card,
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
import {
  BRAND,
  ENGINE_VERSION,
  PRODUCT,
  Project,
  ProtectionDomain,
  SCHEMA_VERSION,
  deviation,
  isKnown,
} from '../../engine';
import { analyzeFor } from '../useAnalysis';
import { TranslationKey } from '../../i18n';

export function Results() {
  const { t, project, importProject, settings } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);

  if (!project) return <><PageHead title={t('res.title')} sub={t('res.subtitle')} /><NoProject /></>;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^\w.-]+/g, '_') || 'rs-limiter-project'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Project;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.channels)) throw new Error('shape');
      importProject(parsed);
      setMsg({ kind: 'ok', text: t('res.importOk') });
    } catch {
      setMsg({ kind: 'danger', text: t('res.importError') });
    }
  };

  return (
    <>
      <div className="no-print">
        <PageHead title={t('res.title')} sub={t('res.subtitle')} />
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="primary" onClick={() => window.print()}>
            {t('res.print')}
          </button>
          <button onClick={exportJson}>{t('res.exportJson')}</button>
          <button onClick={() => fileRef.current?.click()}>{t('res.importJson')}</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = '';
            }}
          />
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </div>

      {/* Report header, printed at the top of the PDF */}
      <div className="report-head">
        <h1 style={{ marginBottom: 2 }}>{t('res.reportTitle')}</h1>
        <div className="small muted">
          {PRODUCT} · {t('app.tagline')} · {t('app.developer')}
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          <strong>{project.name}</strong>
          {project.venue ? ` · ${t('dash.venue')}: ${project.venue}` : ''}
          {project.engineer ? ` · ${t('dash.engineer')}: ${project.engineer}` : ''}
        </div>
        <div className="tiny faint">
          {t('res.generated')}: {new Date().toLocaleString()} · {BRAND}
        </div>
      </div>

      <Card title={t('res.certaintyLegend')}>
        <p className="small muted">
          {(['manufacturer', 'measured', 'calculated', 'estimated', 'unknown'] as const)
            .map((s) => t(`status.${s}` as TranslationKey))
            .join(' · ')}
        </p>
        <Notice kind="warn">{t('dash.safetyBanner')}</Notice>
      </Card>

      {project.channels.length === 0 ? (
        <Empty text={t('g.noChannels')} />
      ) : (
        project.channels.map((ch) => {
          const a = analyzeFor(project, ch);
          if (!a) return null;
          const ls = project.loudspeakers.find((l) => l.id === ch.loudspeakerId);
          const amp = project.amplifiers.find((x) => x.id === ch.amplifierId);
          const dsp = project.dsps.find((d) => d.id === ch.dspId);
          return (
            <Card key={ch.id} title={`${t('g.channel')}: ${ch.name}`}>
              <p className="small muted">
                {t('chain.loudspeaker')}: {ls ? `${ls.manufacturer} ${ls.model}` : t('g.none')} ·{' '}
                {t('chain.amplifier')}: {amp ? `${amp.manufacturer} ${amp.model} (${t(`amp.mode.${amp.mode}` as TranslationKey)})` : t('g.none')} ·{' '}
                {t('chain.dsp')}: {dsp ? `${dsp.manufacturer} ${dsp.model}` : t('g.none')}
                {dsp ? ` · ${t('dsp.convention')}: ${t(`dsp.convention.${dsp.dbfsConvention}` as TranslationKey)}` : ''}
              </p>

              {a.blocked && <Notice kind="danger">{t('calc.blocked')}</Notice>}
              <MissingList missing={a.missing} />
              <WarningList warnings={a.warnings} />

              {a.speaker && (
                <>
                  <h3>{t('calc.speakerLimits')}</h3>
                  <div className="grid">
                    <ValueView label={t('calc.rmsVoltageLimit')} value={a.speaker.rmsAtAmplifier} />
                    <ValueView label={t('calc.peakVoltageLimit')} value={a.speaker.peakAtAmplifier} />
                    <ValueView label={t('calc.equivalentPower')} value={a.speaker.equivalentPower} decimals={1} />
                    <ValueView label={t('calc.totalLoad')} value={a.speaker.load.totalImpedance} decimals={2} />
                  </div>
                </>
              )}

              {a.amp && (
                <>
                  <h3>{t('calc.ampLimits')}</h3>
                  <div className="grid">
                    <ValueView label={t('calc.maxOutputVoltage')} value={a.amp.maxOutputVrms} />
                    <ValueView label={t('calc.gain')} value={a.amp.gainDb} />
                    <ValueView label={t('calc.maxSafeInput')} value={a.amp.maxSafeInputDbu} />
                  </div>
                </>
              )}

              <h3>{t('calc.dspSettings')}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('dsp.protects')}</th>
                      <th className="num">{t('calc.safetyMargin')}</th>
                      <th className="num">{t('calc.target')}</th>
                      <th className="num">{t('calc.threshold')}</th>
                      <th>{t('g.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['thermal', 'peak', 'clip'] as ProtectionDomain[]).map((d) => {
                      const dom = a.domains[d];
                      return (
                        <tr key={d}>
                          <td>{t(`domain.${d}` as TranslationKey)}</td>
                          <td className="num">{fmtSigned(dom.marginDb, 2)} dB</td>
                          <td className="num">
                            {isKnown(dom.targetAtAmplifier)
                              ? `${fmt(dom.targetAtAmplifier.value, 3)} ${dom.targetAtAmplifier.unit}`
                              : '—'}
                          </td>
                          <td className="num">
                            {isKnown(dom.threshold) ? `${fmt(dom.threshold.value, 2)} ${dom.threshold.unit}` : '—'}
                          </td>
                          <td className="tiny">
                            {t(`status.${dom.threshold.status}` as TranslationKey)} ·{' '}
                            {dom.fieldVerified ? t('status.fieldVerified') : t('status.notFieldVerified')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {dsp && (
                <>
                  <h3>{t('dsp.limiters')}</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('dsp.limiterType')}</th>
                          <th className="num">{t('dsp.attack')}</th>
                          <th className="num">{t('dsp.release')}</th>
                          <th className="num">{t('dsp.hold')}</th>
                          <th className="num">{t('dsp.ratio')}</th>
                          <th className="num">{t('dsp.knee')}</th>
                          <th>{t('dsp.detection')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dsp.limiters.map((l) => (
                          <tr key={l.id}>
                            <td>{t(`dsp.type.${l.type}` as TranslationKey)}</td>
                            <td className="num">{l.attackMs.value ?? '—'}</td>
                            <td className="num">{l.releaseMs.value ?? '—'}</td>
                            <td className="num">{l.holdMs.value ?? '—'}</td>
                            <td className="num">{l.ratio.value ?? '—'}</td>
                            <td className="num">{l.kneeDb.value ?? '—'}</td>
                            <td>{t(`dsp.detection.${l.detectionMode}` as TranslationKey)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {dsp.limiters
                    .filter((l) => l.manufacturerRecommendation)
                    .map((l) => (
                      <p key={l.id} className="small">
                        <strong>{t('dsp.recommendation')}</strong> ({t(`dsp.type.${l.type}` as TranslationKey)}):{' '}
                        {l.manufacturerRecommendation}
                      </p>
                    ))}
                </>
              )}

              <h3>{t('res.plannedVsMeasured')}</h3>
              {ch.measurements.length === 0 ? (
                <Empty text={t('res.noMeasurements')} />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('res.generated')}</th>
                        <th>{t('wiz.signal')}</th>
                        <th className="num">{t('wiz.testLevel')}</th>
                        <th className="num">{t('res.measuredCol')}</th>
                        <th className="num">{t('res.planned')}</th>
                        <th className="num">{t('res.delta')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ch.measurements.map((m) => {
                        const gain = a.amp && isKnown(a.amp.gainDb) ? a.amp.gainDb.value : null;
                        const planned =
                          gain !== null && m.dspOutputLevel !== null && m.dspOutputScale === 'dBu'
                            ? 0.775 * Math.pow(10, (m.dspOutputLevel + gain) / 20)
                            : null;
                        const d = deviation(planned, m.measuredVrms, 0.5);
                        return (
                          <tr key={m.id}>
                            <td className="tiny">{new Date(m.timestamp).toLocaleString()}</td>
                            <td>{t(`wiz.signal.${m.signal}` as TranslationKey)}</td>
                            <td className="num">
                              {m.dspOutputLevel ?? '—'} {m.dspOutputScale}
                            </td>
                            <td className="num">{m.measuredVrms ?? '—'}</td>
                            <td className="num">{planned === null ? '—' : fmt(planned, 3)}</td>
                            <td className="num">
                              {d.deltaDb === null ? '—' : `${fmtSigned(d.deltaDb, 2)} dB`}
                              {d.withinTolerance === false ? ' !' : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="chips" style={{ marginTop: 8 }}>
                <VerifiedBadge verified={a.domains.thermal.fieldVerified} />
              </div>
            </Card>
          );
        })
      )}

      {project.notes && (
        <Card title={t('g.notes')}>
          <p className="small">{project.notes}</p>
        </Card>
      )}

      <div className="report-foot print-only">
        {BRAND} · {PRODUCT} {ENGINE_VERSION} · schema v{SCHEMA_VERSION} · {settings.lang.toUpperCase()}
      </div>
    </>
  );
}
