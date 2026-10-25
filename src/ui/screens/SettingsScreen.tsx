import { Card, Notice, PageHead, PlainNumberField, SelectField } from '../components';
import { useStore } from '../../state/store';
import { BRAND, DbfsConvention, ENGINE_VERSION, PRODUCT, SCHEMA_VERSION } from '../../engine';
import { TranslationKey } from '../../i18n';

export function SettingsScreen() {
  const { t, settings, setSettings, projects, library, clearAll } = useStore();

  return (
    <>
      <PageHead title={t('set.title')} />

      <Card title={t('set.theme')}>
        <SelectField<'dark' | 'light'>
          label={t('set.theme')}
          value={settings.theme}
          onChange={(v) => setSettings({ theme: v })}
          options={[
            { value: 'dark', label: t('set.theme.dark') },
            { value: 'light', label: t('set.theme.light') },
          ]}
          hint={t('set.themeHelp')}
        />
      </Card>

      <Card title={t('set.defaults')}>
        <Notice kind="warn">{t('chain.marginHelp')}</Notice>
        <div className="grid">
          <PlainNumberField
            label={t('chain.marginThermal')}
            unit="dB"
            value={settings.defaultMargins.thermalDb}
            onChange={(v) => setSettings({ defaultMargins: { ...settings.defaultMargins, thermalDb: v ?? -3 } })}
          />
          <PlainNumberField
            label={t('chain.marginPeak')}
            unit="dB"
            value={settings.defaultMargins.peakDb}
            onChange={(v) => setSettings({ defaultMargins: { ...settings.defaultMargins, peakDb: v ?? -3 } })}
          />
          <PlainNumberField
            label={t('chain.marginClip')}
            unit="dB"
            value={settings.defaultMargins.clipDb}
            onChange={(v) => setSettings({ defaultMargins: { ...settings.defaultMargins, clipDb: v ?? -3 } })}
          />
        </div>
        <SelectField<DbfsConvention>
          label={t('set.defaultConvention')}
          value={settings.defaultConvention}
          onChange={(v) => setSettings({ defaultConvention: v })}
          options={(['unknown', 'aes17', 'peak-referenced'] as DbfsConvention[]).map((c) => ({
            value: c,
            label: t(`dsp.convention.${c}` as TranslationKey),
          }))}
          hint={t('set.conventionDefaultHelp')}
        />
      </Card>

      <Card title={t('set.install')}>
        <Notice kind="info">{t('set.installHelp')}</Notice>
        <p className="small muted">
          {navigator.onLine ? '' : `${t('set.offlineReady')} · `}
          {'serviceWorker' in navigator ? t('set.offlineReady') : t('set.offlinePending')}
        </p>
      </Card>

      <Card title={t('set.data')}>
        <p className="small muted">
          {t('set.storage')}: {projects.length} {t('set.projects')} ·{' '}
          {library.loudspeakers.length + library.amplifiers.length + library.dsps.length} {t('prof.library')}
        </p>
        <button
          className="danger"
          onClick={() => {
            if (window.confirm(t('set.clearConfirm'))) clearAll();
          }}
        >
          {t('set.clearAll')}
        </button>
      </Card>

      <Card title={t('set.about')}>
        <p className="small">
          <strong>{PRODUCT}</strong>
          <br />
          {t('app.tagline')}
          <br />
          {t('app.developer')}
          <br />
          {BRAND}
        </p>
        <p className="tiny faint">
          {t('set.version')}: {ENGINE_VERSION} · schema v{SCHEMA_VERSION}
        </p>
      </Card>
    </>
  );
}
