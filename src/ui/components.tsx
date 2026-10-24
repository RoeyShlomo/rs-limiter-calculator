/** RS Limiter Calculator — shared UI primitives. */

import React from 'react';
import { Tracked, ValueStatus, Certainty, MissingDatum, Entry, Unit, isKnown, roundTo } from '../engine';
import { useStore } from '../state/store';
import { TranslationKey } from '../i18n';

// ---------------------------------------------------------------- formatting

export function fmt(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const r = roundTo(value, decimals);
  return Object.is(r, -0) ? '0' : String(r);
}

export function fmtSigned(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const s = fmt(value, decimals);
  return value > 0 ? `+${s}` : s;
}

// ---------------------------------------------------------------- status

export function StatusBadge({ status }: { status: ValueStatus }) {
  const { t } = useStore();
  return <span className={`badge s-${status}`}>{t(`status.${status}` as TranslationKey)}</span>;
}

export function CertaintyBadge({ certainty }: { certainty: Certainty }) {
  const { t } = useStore();
  return (
    <span className="badge tiny">
      {t('g.certainty')}: {t(`certainty.${certainty}` as TranslationKey)}
    </span>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  const { t } = useStore();
  return (
    <span className={`badge ${verified ? 'verified' : 'unverified'}`}>
      {verified ? t('status.fieldVerified') : t('status.notFieldVerified')}
    </span>
  );
}

// ---------------------------------------------------------------- value card

/** Renders an engine value with its formula, source data and certainty. */
export function ValueView({
  label,
  value,
  decimals = 3,
  emphasis,
}: {
  label: string;
  value: Tracked;
  decimals?: number;
  emphasis?: boolean;
}) {
  const { t } = useStore();
  const known = isKnown(value);
  return (
    <div className="value" style={emphasis ? { borderColor: 'var(--accent)' } : undefined}>
      <div className="vlabel">{label}</div>
      <div className="vmain">
        {known ? (
          <>
            <span className="vnum">{fmt(value.value, decimals)}</span>
            <span className="vunit">{value.unit}</span>
          </>
        ) : (
          <span className="vnum none">{t('g.notSet')}</span>
        )}
      </div>
      <div className="vmeta">
        <StatusBadge status={value.status} />
        {known && <CertaintyBadge certainty={value.certainty} />}
      </div>
      {(value.formula || value.sources?.length || value.notes?.length) && (
        <details>
          <summary>{t('g.showFormula')}</summary>
          {value.formula && <div className="formula ltr">{value.formula}</div>}
          {value.sources?.length ? (
            <div className="vsrc">
              {t('g.sources')}: {value.sources.join(' · ')}
            </div>
          ) : null}
          {value.notes?.length ? (
            <ul className="vnotes">
              {value.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- notices

export function Notice({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warn' | 'danger' | 'ok';
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`notice ${kind}`}>
      {title && <strong>{title}</strong>}
      {title && children ? ' ' : null}
      {children}
    </div>
  );
}

export function WarningList({ warnings, title }: { warnings: string[]; title?: string }) {
  const { t } = useStore();
  if (!warnings.length) return null;
  return (
    <div className="notice warn">
      <strong>{title ?? t('g.warnings')}</strong>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function MissingList({ missing }: { missing: MissingDatum[] }) {
  const { t } = useStore();
  if (!missing.length) return null;
  return (
    <div className="notice danger">
      <strong>{t('g.missingData')}</strong>
      <ul>
        {missing.map((m, i) => (
          <li key={i}>
            <strong>{m.field}</strong> — {m.detail}
            <br />
            <span className="tiny faint">
              {t('g.blocks')}: {m.blocks.map((b) => t(`domain.${b}.short` as TranslationKey) || b).join(', ')} ·{' '}
              {t(`g.remedy.${m.remedy}` as TranslationKey)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- inputs

const USER_STATUSES: ValueStatus[] = ['manufacturer', 'measured', 'estimated', 'unknown'];

/** Numeric entry with its unit and an explicit provenance selector. */
export function NumberField({
  label,
  entry,
  unit,
  onChange,
  hint,
  step,
  showStatus = true,
}: {
  label: string;
  entry: Entry;
  unit?: Unit | string;
  onChange: (e: Entry) => void;
  hint?: string;
  step?: string;
  showStatus?: boolean;
}) {
  const { t } = useStore();
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-inline">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step ?? 'any'}
          value={entry.value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange({ ...entry, value: null, status: 'unknown' });
              return;
            }
            const v = Number(raw);
            onChange({
              ...entry,
              value: Number.isFinite(v) ? v : null,
              // A value only becomes data once it has a provenance: default to the
              // manufacturer specification, which the user can change.
              status: entry.status === 'unknown' ? 'manufacturer' : entry.status,
            });
          }}
        />
        {(unit ?? entry.unit) && <span className="unit">{unit ?? entry.unit}</span>}
        {showStatus && (
          <select
            className="status-select"
            aria-label={t('g.status')}
            value={entry.status}
            onChange={(e) => onChange({ ...entry, status: e.target.value as ValueStatus })}
          >
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}` as TranslationKey)}
              </option>
            ))}
          </select>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function PlainNumberField({
  label,
  value,
  onChange,
  unit,
  hint,
  step,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  hint?: string;
  step?: string;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-inline">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step ?? 'any'}
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(null);
            const v = Number(raw);
            onChange(Number.isFinite(v) ? v : null);
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="checkbox-row">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

// ---------------------------------------------------------------- layout

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="spread" style={{ marginBottom: 10 }}>
          {title ? <h2 style={{ margin: 0 }}>{title}</h2> : <span />}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="muted small">{text}</p>;
}

/** Channel picker shared by every per-channel screen. */
export function ChannelPicker() {
  const { project, channel, setActiveChannelId, t } = useStore();
  if (!project || project.channels.length === 0) return null;
  return (
    <div className="field" style={{ maxWidth: 320 }}>
      <label htmlFor="channel-picker">{t('calc.selectChannel')}</label>
      <select
        id="channel-picker"
        value={channel?.id ?? ''}
        onChange={(e) => setActiveChannelId(e.target.value)}
      >
        {project.channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NoProject() {
  const { t, createProject } = useStore();
  return (
    <Card>
      <Notice kind="info">{t('dash.noProject')}</Notice>
      <button className="primary" onClick={() => createProject()}>
        {t('dash.newProject')}
      </button>
    </Card>
  );
}
