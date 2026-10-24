/**
 * RS Limiter Calculator — value provenance and certainty.
 *
 * Every number that leaves the engine carries exactly one status label so the UI
 * can never present an estimate as a verified, safety-critical figure.
 */

export type ValueStatus =
  | 'calculated'
  | 'measured'
  | 'manufacturer'
  | 'estimated'
  | 'unknown';

/** How much engineering weight a value may carry. */
export type Certainty = 'high' | 'medium' | 'low' | 'none';

/** Physical / electrical quantity domains the engine keeps strictly separate. */
export type Domain = 'rms' | 'peak' | 'power' | 'level' | 'ratio' | 'time' | 'impedance';

export type Unit =
  | 'V'
  | 'Vrms'
  | 'Vpeak'
  | 'dBu'
  | 'dBV'
  | 'dBFS'
  | 'dB'
  | 'W'
  | 'ohm'
  | 'ms'
  | 's'
  | 'Hz'
  | 'x'
  | 'mm';

/** A single engine result, with its own audit trail. */
export interface Tracked {
  value: number | null;
  unit: Unit;
  domain: Domain;
  status: ValueStatus;
  certainty: Certainty;
  /** Human-readable formula actually used, in standard English notation. */
  formula?: string;
  /** Which input fields fed this value. */
  sources?: string[];
  /** Engineering caveats that MUST be surfaced in the UI. */
  notes?: string[];
}

export function tracked(
  value: number | null,
  unit: Unit,
  domain: Domain,
  status: ValueStatus,
  certainty: Certainty,
  extra: Pick<Tracked, 'formula' | 'sources' | 'notes'> = {},
): Tracked {
  return { value, unit, domain, status, certainty, ...extra };
}

export function unknown(unit: Unit, domain: Domain, reason: string): Tracked {
  return {
    value: null,
    unit,
    domain,
    status: 'unknown',
    certainty: 'none',
    notes: [reason],
  };
}

export function isKnown(t: Tracked | null | undefined): t is Tracked & { value: number } {
  return !!t && t.value !== null && Number.isFinite(t.value);
}

const CERTAINTY_ORDER: Certainty[] = ['none', 'low', 'medium', 'high'];

/** The combined certainty of a derived value is never better than its worst input. */
export function worstCertainty(...items: (Certainty | undefined)[]): Certainty {
  let worst = 'high' as Certainty;
  for (const c of items) {
    if (!c) continue;
    if (CERTAINTY_ORDER.indexOf(c) < CERTAINTY_ORDER.indexOf(worst)) worst = c;
  }
  return worst;
}

/**
 * A derived value is only 'measured' when every contributing value was measured.
 * Otherwise it is 'calculated', and 'estimated' if any input was estimated.
 */
export function derivedStatus(...items: (ValueStatus | undefined)[]): ValueStatus {
  const present = items.filter(Boolean) as ValueStatus[];
  if (present.some((s) => s === 'unknown')) return 'unknown';
  if (present.some((s) => s === 'estimated')) return 'estimated';
  if (present.length > 0 && present.every((s) => s === 'measured')) return 'measured';
  return 'calculated';
}

/** A missing piece of input data that blocks a safety-critical result. */
export interface MissingDatum {
  field: string;
  /** Which protection domain(s) this blocks. */
  blocks: string[];
  /** What the user can do: enter a spec, or run the field calibration wizard. */
  remedy: 'enter-specification' | 'field-calibration' | 'choose-convention';
  detail: string;
}
