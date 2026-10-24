import { Card, Empty, Notice, PageHead, TextField, VerifiedBadge, fmt } from '../components';
import { useStore } from '../../state/store';
import { analyzeFor } from '../useAnalysis';
import { isKnown, ProtectionDomain } from '../../engine';
import { TranslationKey } from '../../i18n';

export function Dashboard({ go }: { go: (route: string) => void }) {
  const { t, project, projects, createProject, updateProject, setActiveId, addChannel, setActiveChannelId } =
    useStore();

  return (
    <>
      <PageHead title={t('dash.title')} sub={`${t('app.tagline')} · ${t('app.developer')}`} />
      <Notice kind="warn">{t('dash.safetyBanner')}</Notice>

      <Card title={t('dash.project')}>
        {projects.length > 0 && (
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="proj">{t('dash.openProject')}</label>
            <select id="proj" value={project?.id ?? ''} onChange={(e) => setActiveId(e.target.value || null)}>
              <option value="">— {t('g.none')} —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {project ? (
          <>
            <div className="grid">
              <TextField label={t('g.name')} value={project.name} onChange={(v) => updateProject({ name: v })} />
              <TextField label={t('dash.venue')} value={project.venue} onChange={(v) => updateProject({ venue: v })} />
              <TextField
                label={t('dash.engineer')}
                value={project.engineer}
                onChange={(v) => updateProject({ engineer: v })}
              />
            </div>
            <div className="row">
              <button onClick={() => createProject()}>{t('dash.newProject')}</button>
              <button
                onClick={() => {
                  addChannel();
                  go('/chain');
                }}
              >
                {t('dash.addChannel')}
              </button>
            </div>
          </>
        ) : (
          <>
            <Notice kind="info">{t('dash.noProject')}</Notice>
            <div className="row">
              <button className="primary" onClick={() => createProject()}>
                {t('dash.newProject')}
              </button>
              <button onClick={() => go('/quick')}>{t('dash.quickStart')}</button>
            </div>
          </>
        )}
      </Card>

      {project && (
        <>
          <Card title={t('dash.equipment')}>
            <div className="grid">
              <CountTile label={t('nav.loudspeaker')} n={project.loudspeakers.length} onClick={() => go('/loudspeakers')} />
              <CountTile label={t('nav.amplifier')} n={project.amplifiers.length} onClick={() => go('/amplifiers')} />
              <CountTile label={t('nav.dsp')} n={project.dsps.length} onClick={() => go('/dsp')} />
              <CountTile label={t('g.channels')} n={project.channels.length} onClick={() => go('/chain')} />
            </div>
          </Card>

          <Card title={t('dash.readiness')}>
            {project.channels.length === 0 ? (
              <Empty text={t('g.noChannels')} />
            ) : (
              <div className="stack">
                {project.channels.map((ch) => {
                  const a = analyzeFor(project, ch);
                  const ready = a && !a.blocked;
                  return (
                    <div className="list-item" key={ch.id}>
                      <div className="spread">
                        <div>
                          <div className="item-title">{ch.name}</div>
                          <div className="item-sub">
                            {t(`ls.band.${ch.band}` as TranslationKey)} ·{' '}
                            {ready ? t('dash.ready') : t('dash.blocked')}
                            {a?.totalLoadOhm ? ` · ${fmt(a.totalLoadOhm, 2)} ohm` : ''}
                          </div>
                        </div>
                        <button
                          className="small"
                          onClick={() => {
                            setActiveChannelId(ch.id);
                            go('/calculations');
                          }}
                        >
                          {t('dash.openChannel')}
                        </button>
                      </div>
                      {a && (
                        <div className="chips" style={{ marginTop: 8 }}>
                          {(['thermal', 'peak', 'clip'] as ProtectionDomain[]).map((d) => (
                            <span key={d} className="badge tiny">
                              {t(`domain.${d}.short` as TranslationKey)}:{' '}
                              {isKnown(a.domains[d].threshold)
                                ? `${fmt(a.domains[d].threshold.value, 2)} ${a.domains[d].threshold.unit}`
                                : t('g.notSet')}
                            </span>
                          ))}
                          <VerifiedBadge verified={a.domains.thermal.fieldVerified} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function CountTile({ label, n, onClick }: { label: string; n: number; onClick: () => void }) {
  return (
    <button className="value" style={{ textAlign: 'start', cursor: 'pointer' }} onClick={onClick}>
      <div className="vlabel">{label}</div>
      <div className="vmain">
        <span className="vnum">{n}</span>
      </div>
    </button>
  );
}
