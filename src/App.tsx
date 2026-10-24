import { useEffect, useState } from 'react';
import { useStore } from './state/store';
import { TranslationKey } from './i18n';
import { Dashboard } from './ui/screens/Dashboard';
import { QuickCalculator } from './ui/screens/QuickCalculator';
import { Loudspeakers } from './ui/screens/Loudspeakers';
import { Amplifiers } from './ui/screens/Amplifiers';
import { Dsps } from './ui/screens/Dsps';
import { SignalChain } from './ui/screens/SignalChain';
import { Calculations } from './ui/screens/Calculations';
import { Dynamics } from './ui/screens/Dynamics';
import { Wizard } from './ui/screens/Wizard';
import { Results } from './ui/screens/Results';
import { Profiles } from './ui/screens/Profiles';
import { SettingsScreen } from './ui/screens/SettingsScreen';

const ROUTES: { path: string; key: TranslationKey }[] = [
  { path: '/', key: 'nav.dashboard' },
  { path: '/quick', key: 'nav.quick' },
  { path: '/loudspeakers', key: 'nav.loudspeaker' },
  { path: '/amplifiers', key: 'nav.amplifier' },
  { path: '/dsp', key: 'nav.dsp' },
  { path: '/chain', key: 'nav.chain' },
  { path: '/calculations', key: 'nav.calculations' },
  { path: '/dynamics', key: 'nav.dynamics' },
  { path: '/wizard', key: 'nav.wizard' },
  { path: '/results', key: 'nav.results' },
  { path: '/profiles', key: 'nav.profiles' },
  { path: '/settings', key: 'nav.settings' },
];

/** Hash routing: works from a static host such as GitHub Pages with no server rewrites. */
function useHashRoute(): [string, (r: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (r: string) => {
    window.location.hash = r;
  };
  return [route, go];
}

export function App() {
  const { t } = useStore();
  const [route, go] = useHashRoute();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, [route]);

  const screen = (() => {
    switch (route) {
      case '/quick':
        return <QuickCalculator />;
      case '/loudspeakers':
        return <Loudspeakers />;
      case '/amplifiers':
        return <Amplifiers />;
      case '/dsp':
        return <Dsps />;
      case '/chain':
        return <SignalChain />;
      case '/calculations':
        return <Calculations />;
      case '/dynamics':
        return <Dynamics />;
      case '/wizard':
        return <Wizard />;
      case '/results':
        return <Results />;
      case '/profiles':
        return <Profiles />;
      case '/settings':
        return <SettingsScreen />;
      default:
        return <Dashboard go={go} />;
    }
  })();

  return (
    <>
      <div className="topbar no-print">
        <button className="small" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen}>
          ☰ {t('nav.menu')}
        </button>
        <strong>{t('app.name')}</strong>
      </div>
      <div className="app">
        {navOpen && <div className="backdrop no-print" onClick={() => setNavOpen(false)} />}
        <nav className={`nav no-print ${navOpen ? 'open' : ''}`} aria-label={t('nav.menu')}>
          <div className="brand">
            <div className="brand-name">{t('app.name')}</div>
            <div className="brand-tag">{t('app.universal')}</div>
            <div className="brand-by">{t('app.developer')}</div>
          </div>
          {ROUTES.map((r) => (
            <a
              key={r.path}
              href={`#${r.path}`}
              className={route === r.path ? 'active' : ''}
              aria-current={route === r.path ? 'page' : undefined}
            >
              {t(r.key)}
            </a>
          ))}
          <div className="brand-by" style={{ marginTop: 'auto', paddingTop: 16 }}>
            {t('app.brand')}
          </div>
        </nav>
        <main className="main">{screen}</main>
      </div>
    </>
  );
}
