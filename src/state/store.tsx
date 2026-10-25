/** RS Limiter Calculator — application state, persisted locally. */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  Amplifier,
  ChannelConfig,
  DEFAULT_MARGINS,
  DbfsConvention,
  DspDevice,
  Loudspeaker,
  Project,
  SCHEMA_VERSION,
  SafetyMargins,
  newChannel,
  newProject,
} from '../engine';
import { Lang, TranslationKey, translate, DIRECTION } from '../i18n';

const KEY = {
  projects: 'rs-limiter:projects',
  active: 'rs-limiter:activeProject',
  settings: 'rs-limiter:settings',
  profiles: 'rs-limiter:profiles',
} as const;

export interface Settings {
  lang: Lang;
  theme: 'dark' | 'light';
  defaultMargins: SafetyMargins;
  defaultConvention: DbfsConvention;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  theme: 'dark',
  defaultMargins: { ...DEFAULT_MARGINS },
  defaultConvention: 'unknown',
};

export interface ProfileLibrary {
  loudspeakers: Loudspeaker[];
  amplifiers: Amplifier[];
  dsps: DspDevice[];
}

const EMPTY_LIBRARY: ProfileLibrary = { loudspeakers: [], amplifiers: [], dsps: [] };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage can be unavailable or full; the app stays usable in memory. */
  }
}

export interface Store {
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  t: (key: TranslationKey) => string;
  dir: 'rtl' | 'ltr';

  projects: Project[];
  project: Project | null;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  createProject: (name?: string) => Project;
  updateProject: (patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  importProject: (p: Project) => void;

  channel: ChannelConfig | null;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  addChannel: () => ChannelConfig | null;
  updateChannel: (id: string, patch: Partial<ChannelConfig>) => void;
  removeChannel: (id: string) => void;

  upsertLoudspeaker: (ls: Loudspeaker) => void;
  removeLoudspeaker: (id: string) => void;
  upsertAmplifier: (a: Amplifier) => void;
  removeAmplifier: (id: string) => void;
  upsertDsp: (d: DspDevice) => void;
  removeDsp: (id: string) => void;

  library: ProfileLibrary;
  setLibrary: (l: ProfileLibrary) => void;

  clearAll: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...read<Partial<Settings>>(KEY.settings, {}),
    // The interface is English-only. Older saved settings may still say 'he'.
    lang: 'en',
  }));
  const [projects, setProjects] = useState<Project[]>(() => read<Project[]>(KEY.projects, []));
  const [activeId, setActiveId] = useState<string | null>(() => read<string | null>(KEY.active, null));
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [library, setLibraryState] = useState<ProfileLibrary>(() => read<ProfileLibrary>(KEY.profiles, EMPTY_LIBRARY));

  useEffect(() => write(KEY.settings, settings), [settings]);
  useEffect(() => write(KEY.projects, projects), [projects]);
  useEffect(() => write(KEY.active, activeId), [activeId]);
  useEffect(() => write(KEY.profiles, library), [library]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = settings.lang;
    root.dir = DIRECTION[settings.lang];
    root.dataset.theme = settings.theme;
  }, [settings.lang, settings.theme]);

  const project = useMemo(() => projects.find((p) => p.id === activeId) ?? null, [projects, activeId]);
  const channel = useMemo(
    () => project?.channels.find((c) => c.id === activeChannelId) ?? project?.channels[0] ?? null,
    [project, activeChannelId],
  );

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const t = useCallback((key: TranslationKey) => translate(settings.lang, key), [settings.lang]);

  const updateProject = useCallback(
    (patch: Partial<Project>) => {
      setProjects((list) =>
        list.map((p) => (p.id === activeId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
      );
    },
    [activeId],
  );

  const createProject = useCallback(
    (name?: string) => {
      const p = newProject({ name: name || 'New project' });
      setProjects((list) => [...list, p]);
      setActiveId(p.id);
      setActiveChannelId(null);
      return p;
    },
    [],
  );

  const deleteProject = useCallback((id: string) => {
    setProjects((list) => list.filter((p) => p.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  const importProject = useCallback((p: Project) => {
    const imported: Project = { ...p, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
    setProjects((list) => [...list.filter((x) => x.id !== imported.id), imported]);
    setActiveId(imported.id);
    setActiveChannelId(null);
  }, []);

  const addChannel = useCallback(() => {
    if (!project) return null;
    const ch = newChannel({
      name: `${translate(settings.lang, 'g.channel')} ${project.channels.length + 1}`,
      margins: { ...settings.defaultMargins },
    });
    updateProject({ channels: [...project.channels, ch] });
    setActiveChannelId(ch.id);
    return ch;
  }, [project, settings.defaultMargins, settings.lang, updateProject]);

  const updateChannel = useCallback(
    (id: string, patch: Partial<ChannelConfig>) => {
      if (!project) return;
      updateProject({ channels: project.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    },
    [project, updateProject],
  );

  const removeChannel = useCallback(
    (id: string) => {
      if (!project) return;
      updateProject({ channels: project.channels.filter((c) => c.id !== id) });
    },
    [project, updateProject],
  );

  function upsert<T extends { id: string }>(list: T[], item: T): T[] {
    return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
  }

  const upsertLoudspeaker = useCallback(
    (ls: Loudspeaker) => project && updateProject({ loudspeakers: upsert(project.loudspeakers, ls) }),
    [project, updateProject],
  );
  const removeLoudspeaker = useCallback(
    (id: string) =>
      project &&
      updateProject({
        loudspeakers: project.loudspeakers.filter((x) => x.id !== id),
        channels: project.channels.map((c) => (c.loudspeakerId === id ? { ...c, loudspeakerId: null } : c)),
      }),
    [project, updateProject],
  );
  const upsertAmplifier = useCallback(
    (a: Amplifier) => project && updateProject({ amplifiers: upsert(project.amplifiers, a) }),
    [project, updateProject],
  );
  const removeAmplifier = useCallback(
    (id: string) =>
      project &&
      updateProject({
        amplifiers: project.amplifiers.filter((x) => x.id !== id),
        channels: project.channels.map((c) => (c.amplifierId === id ? { ...c, amplifierId: null } : c)),
      }),
    [project, updateProject],
  );
  const upsertDsp = useCallback(
    (d: DspDevice) => project && updateProject({ dsps: upsert(project.dsps, d) }),
    [project, updateProject],
  );
  const removeDsp = useCallback(
    (id: string) =>
      project &&
      updateProject({
        dsps: project.dsps.filter((x) => x.id !== id),
        channels: project.channels.map((c) => (c.dspId === id ? { ...c, dspId: null } : c)),
      }),
    [project, updateProject],
  );

  const clearAll = useCallback(() => {
    setProjects([]);
    setActiveId(null);
    setActiveChannelId(null);
    setLibraryState(EMPTY_LIBRARY);
    for (const k of Object.values(KEY)) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const value: Store = {
    settings,
    setSettings,
    t,
    dir: DIRECTION[settings.lang],
    projects,
    project,
    activeId,
    setActiveId,
    createProject,
    updateProject,
    deleteProject,
    importProject,
    channel,
    activeChannelId: channel?.id ?? null,
    setActiveChannelId,
    addChannel,
    updateChannel,
    removeChannel,
    upsertLoudspeaker,
    removeLoudspeaker,
    upsertAmplifier,
    removeAmplifier,
    upsertDsp,
    removeDsp,
    library,
    setLibrary: setLibraryState,
    clearAll,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
