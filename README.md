# RS Limiter Calculator

**Professional Audio System Design & Calibration**
Developed by Roey Shlomo — *RS – Roey Shlomo*

A device-independent tool for planning, calculating, configuring and field-verifying
limiters in sound reinforcement systems. It assumes no DSP, amplifier or loudspeaker
manufacturer, and refuses to produce a safety-critical number when the data needed to
make that number safe is missing.

Hebrew (RTL) by default, switchable to English. Installable as an offline PWA for field
work on iPhone and desktop.

---

## Engineering position

The tool is built around a small set of rules that it enforces in code, not only in the
documentation:

1. No DSP manufacturer is assumed anywhere.
2. **0 dBFS is never taken to equal 0 dBu.** A threshold in dBFS is produced only once
   the device's dBFS convention *and* its analog full-scale reference are both
   established. A new device starts as *"Unknown, calibration required"*.
3. Amplifier output level and DSP output level are separate quantities throughout.
4. Nominal impedance is never treated as a constant physical resistance. Every power
   figure derived from it is labelled an **equivalent** value for a resistive load.
5. AES, Continuous, Program and Peak ratings are never interchangeable.
6. **A mechanical peak limit is never inferred from an AES rating.** An AES rating
   describes thermal capability and carries no excursion information.
7. RMS voltage, peak voltage and power are distinct. The engine never crosses between
   the RMS and peak domains without an explicit crest factor.
8. Thermal, excursion and amplifier-clipping protection are calculated as three
   separate domains, each with its own limit, margin and threshold.
9. The tool states plainly that a peak limiter alone is not complete loudspeaker
   protection, and that a thermal limiter alone does not prevent excursion damage.
10. Missing calibration data blocks the result and is reported as a specific, named gap
    with a remedy, rather than being filled with an assumption.
11. No equipment specification is ever invented.
12. Nothing is marked **field verified** unless measurement data was actually entered.

Every value the engine produces carries exactly one status label — *Calculated*,
*Measured*, *Manufacturer Specified*, *Estimated (requires verification)* or *Unknown* —
together with its certainty, the formula used and the source fields it came from.

## Core equations

```
P        = Vrms^2 / R
Vrms     = sqrt(P * R)
dBu      = 20 * log10(Vrms / 0.775)
dBV      = 20 * log10(Vrms / 1)
Gain(dB) = 20 * log10(Vout / Vin)

Required DSP Output Level (dBu) = Target Amplifier Output Level (dBu) - Amplifier Voltage Gain (dB)
Threshold (dBFS)                = Required DSP Output Level (dBu) - Analog Full-Scale Reference (dBu)
                                  + convention offset
```

The convention offset is `0 dB` under AES17 (full-scale sine = 0 dBFS RMS) and
`-3.01 dB` under the peak-referenced convention (full-scale sine = -3.01 dBFS). The
dBFS equation is valid only when the threshold reference and the analog output
calibration have both been correctly identified, and the engine returns *Unknown*
rather than a number when they have not.

> **Note on the dBu reference.** This project fixes `0 dBu = 0.775 Vrms`, as specified.
> The historical 600 Ω / 1 mW reference is 0.7745967 Vrms; the difference is 0.0045 dB,
> and it makes the dBu-to-dBV offset 2.2140 dB here rather than the textbook 2.2185 dB.

## Architecture

```
src/engine/     calculation engine — no UI imports anywhere
  status.ts        provenance, certainty propagation, missing-data reporting
  units.ts         dBu / dBV / Vrms / Vpeak, crest factors, waveform library
  power.ts         power <-> voltage <-> impedance, equivalent-power labelling
  load.ts          series / parallel / series-parallel topology
  loudspeaker.ts   voltage limits from published data
  amplifier.ts     voltage gain, sensitivity, max output, bridge / parallel modes
  dsp.ts           dBFS conventions and scale expression
  chain.ts         pre- and post-limiter gain accounting
  limiter.ts       per-domain thresholds and the most restrictive limit
  dynamics.ts      attack / release / detection references and caveats
  calibration.ts   field calibration mathematics and instrument checks
src/i18n/       Hebrew and English dictionaries (identical key sets)
src/state/      project persistence in localStorage
src/ui/         React screens and shared components
```

Technical terms, units and formulas stay in standard English notation in both languages.

## Screens

Dashboard · Quick Calculator · Loudspeaker Configuration · Amplifier Configuration ·
DSP Limiter Configuration · Signal Chain · Limiter Calculations · Attack/Release
Analysis · Field Calibration Wizard · Results and Reports · Equipment Profiles · Settings

The Quick Calculator works without creating a project.

## Development

```bash
npm install
npm run dev      # development server
npm test         # calculation engine test suite
npm run build    # production build into dist/ plus the offline service worker
```

### Tests

```bash
npm test
```

- `src/engine/__tests__/validation.test.ts` — specification Tests 1–11
- `src/engine/__tests__/engine.test.ts` — engineering rules 1–12, peak-domain
  thresholds, bridge mode, field calibration and dynamic parameters

An optional end-to-end browser check lives in `scripts/smoke.mjs`; see the header of
that file for how to run it. It requires Playwright, which is deliberately not a
dependency of this project.

## Deployment

Pushing to `main` runs the test suite and deploys `dist/` to GitHub Pages through
`.github/workflows/deploy.yml`. Enable **Settings → Pages → Source: GitHub Actions**
once in the repository.

The build base path is `/rs-limiter-calculator/`. For a different path, set it in
`vite.config.ts` and pass the matching `RS_BASE` to `scripts/build-sw.mjs`.

### Offline use

The service worker precaches the whole application shell, so after the first load the
tool works with no network at all. On iPhone, open the deployed URL in Safari, then
**Share → Add to Home Screen**.

## Data

Projects, equipment profiles and measurements are stored locally in the browser. Nothing
is uploaded anywhere. Projects export and import as JSON, and the Results screen prints
to PDF through the browser, which keeps Hebrew and RTL typesetting intact.

---

## Disclaimer

This tool assists engineering decisions. It does not replace manufacturer documentation,
and no calculated threshold protects a loudspeaker until it has been verified in the
field. Amplifier outputs at performance level carry voltages that can injure or kill.

All reports and exported files carry **RS – Roey Shlomo**.
