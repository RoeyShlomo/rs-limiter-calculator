import { useRef, useState } from 'react';
import { Card, Empty, Notice, PageHead } from '../components';
import { useStore, ProfileLibrary } from '../../state/store';
import { uid } from '../../engine';

export function Profiles() {
  const { t, library, setLibrary, project, upsertLoudspeaker, upsertAmplifier, upsertDsp } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rs-limiter-equipment-profiles.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAll = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as ProfileLibrary;
      setLibrary({
        loudspeakers: [...library.loudspeakers, ...(parsed.loudspeakers ?? [])],
        amplifiers: [...library.amplifiers, ...(parsed.amplifiers ?? [])],
        dsps: [...library.dsps, ...(parsed.dsps ?? [])],
      });
      setMsg(t('res.importOk'));
    } catch {
      setMsg(t('res.importError'));
    }
  };

  return (
    <>
      <PageHead title={t('prof.title')} sub={t('prof.subtitle')} />
      <div className="row" style={{ marginBottom: 14 }}>
        <button onClick={exportAll}>{t('prof.exportAll')}</button>
        <button onClick={() => fileRef.current?.click()}>{t('prof.importAll')}</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importAll(f);
            e.target.value = '';
          }}
        />
      </div>
      {msg && <Notice kind="info">{msg}</Notice>}

      <Card title={t('prof.loudspeakers')}>
        {library.loudspeakers.length === 0 ? (
          <Empty text={t('prof.empty')} />
        ) : (
          library.loudspeakers.map((ls) => (
            <div className="list-item" key={ls.id}>
              <div className="spread">
                <div>
                  <div className="item-title">
                    {ls.manufacturer} {ls.model}
                  </div>
                  <div className="item-sub">
                    {ls.nominalImpedance.value ?? '—'} ohm · AES {ls.aesPower.value ?? '—'} W · {ls.band}
                  </div>
                </div>
                <div className="row">
                  <button
                    className="small"
                    disabled={!project}
                    onClick={() => {
                      upsertLoudspeaker({ ...ls, id: uid('ls') });
                      setMsg(t('prof.added'));
                    }}
                  >
                    {t('prof.useInProject')}
                  </button>
                  <button
                    className="small danger"
                    onClick={() =>
                      setLibrary({ ...library, loudspeakers: library.loudspeakers.filter((x) => x.id !== ls.id) })
                    }
                  >
                    {t('g.delete')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card title={t('prof.amplifiers')}>
        {library.amplifiers.length === 0 ? (
          <Empty text={t('prof.empty')} />
        ) : (
          library.amplifiers.map((amp) => (
            <div className="list-item" key={amp.id}>
              <div className="spread">
                <div>
                  <div className="item-title">
                    {amp.manufacturer} {amp.model}
                  </div>
                  <div className="item-sub">
                    {amp.voltageGainDb.value !== null ? `${amp.voltageGainDb.value} dB` : '—'} ·{' '}
                    {amp.ratings.map((r) => `${r.powerW} W / ${r.impedanceOhm} ohm`).join(', ') || '—'} · {amp.mode}
                  </div>
                </div>
                <div className="row">
                  <button
                    className="small"
                    disabled={!project}
                    onClick={() => {
                      upsertAmplifier({ ...amp, id: uid('amp') });
                      setMsg(t('prof.added'));
                    }}
                  >
                    {t('prof.useInProject')}
                  </button>
                  <button
                    className="small danger"
                    onClick={() =>
                      setLibrary({ ...library, amplifiers: library.amplifiers.filter((x) => x.id !== amp.id) })
                    }
                  >
                    {t('g.delete')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card title={t('prof.dsps')}>
        {library.dsps.length === 0 ? (
          <Empty text={t('prof.empty')} />
        ) : (
          library.dsps.map((dsp) => (
            <div className="list-item" key={dsp.id}>
              <div className="spread">
                <div>
                  <div className="item-title">
                    {dsp.manufacturer} {dsp.model}
                  </div>
                  <div className="item-sub">
                    {dsp.dbfsConvention} · FS {dsp.analogFullScaleDbu.value ?? '—'} dBu · {dsp.limiters.length} limiters
                  </div>
                </div>
                <div className="row">
                  <button
                    className="small"
                    disabled={!project}
                    onClick={() => {
                      upsertDsp({ ...dsp, id: uid('dsp') });
                      setMsg(t('prof.added'));
                    }}
                  >
                    {t('prof.useInProject')}
                  </button>
                  <button
                    className="small danger"
                    onClick={() => setLibrary({ ...library, dsps: library.dsps.filter((x) => x.id !== dsp.id) })}
                  >
                    {t('g.delete')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
