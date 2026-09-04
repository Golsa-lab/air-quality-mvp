/**
 * Everything that is true about a pollutant regardless of the data.
 *
 * This file is deliberately free of database access so it can be unit tested on
 * its own. It encodes the one fact that shapes the whole application: the legal
 * limit and the raw data are defined on different time bases, and they do not
 * always line up.
 */

export type PollutantKey = "PM10" | "PM2.5" | "NO2" | "O3";

/** The averaging period a limit is defined over. */
export type Basis = "hourly" | "daily" | "annual";

export interface PollutantConfig {
  key: PollutantKey;
  /** Value of `nometiposensore` in the source data. */
  sensorType: string;
  label: string;
  unit: string;
  limit: number;
  /** Period the limit is defined over. */
  limitBasis: Basis;
  /** Period the sensors actually report on. */
  dataBasis: Basis;
}

export const POLLUTANTS: Record<PollutantKey, PollutantConfig> = {
  PM10: {
    key: "PM10",
    sensorType: "PM10 (SM2005)",
    label: "PM10",
    unit: "µg/m³",
    limit: 50,
    limitBasis: "daily",
    dataBasis: "daily",
  },
  "PM2.5": {
    key: "PM2.5",
    sensorType: "Particelle sospese PM2.5",
    label: "PM2.5",
    unit: "µg/m³",
    limit: 25,
    limitBasis: "annual",
    dataBasis: "daily",
  },
  NO2: {
    key: "NO2",
    sensorType: "Biossido di Azoto",
    label: "Biossido di azoto",
    unit: "µg/m³",
    limit: 200,
    limitBasis: "hourly",
    dataBasis: "hourly",
  },
  O3: {
    key: "O3",
    sensorType: "Ozono",
    label: "Ozono",
    unit: "µg/m³",
    limit: 180,
    limitBasis: "hourly",
    dataBasis: "hourly",
  },
};

export const POLLUTANT_KEYS = Object.keys(POLLUTANTS) as PollutantKey[];

export function isPollutantKey(v: string): v is PollutantKey {
  return v in POLLUTANTS;
}

/**
 * How a single reading must be turned into a value comparable to the limit.
 *
 *  - "direct"        the reading is already on the limit's time base
 *  - "aggregate"     several readings must be averaged first
 *  - "not-computable" the limit needs a longer window than the dataset covers
 *
 * PM2.5 is the interesting case. Its limit is an annual mean, but the dataset
 * covers roughly six months, so no honest annual figure can be produced. The
 * application says so rather than returning a number that looks official and
 * is not.
 */
export type ComparisonMode = "direct" | "aggregate" | "not-computable";

export function comparisonMode(c: PollutantConfig): ComparisonMode {
  if (c.limitBasis === "annual") return "not-computable";
  if (c.limitBasis === c.dataBasis) return "direct";
  return "aggregate";
}

/** Human-readable reason, shown in the UI and given to the assistant. */
export function notComputableReason(c: PollutantConfig): string | null {
  if (comparisonMode(c) !== "not-computable") return null;
  return (
    `Il limite per ${c.label} è definito come media annuale ` +
    `(${c.limit} ${c.unit}), ma il dataset copre circa sei mesi. ` +
    `Una media annuale non è calcolabile su questo periodo.`
  );
}
