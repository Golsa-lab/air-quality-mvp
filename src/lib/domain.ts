/**
 * The domain layer: the only place in the application that talks to the
 * database, and the only place that knows what a "superamento" is.
 *
 * The web pages and the AI assistant both call these functions. Neither writes
 * its own SQL, so a fix to the aggregation logic reaches both at once and they
 * cannot drift apart.
 */

import { query } from "./db";
import {
  POLLUTANTS,
  POLLUTANT_KEYS,
  type PollutantKey,
  comparisonMode,
  notComputableReason,
} from "./pollutants";

export interface Period {
  /** Inclusive, 'YYYY-MM-DD'. */
  from: string;
  /** Exclusive, 'YYYY-MM-DD'. */
  to: string;
}

export interface ExceedanceRow {
  comune: string;
  readings: number;
  exceedances: number;
  maxValue: number;
}

export interface ExceedanceResult {
  pollutant: PollutantKey;
  limit: number;
  unit: string;
  period: Period;
  computable: boolean;
  /** Set when `computable` is false — explains what is missing. */
  note: string | null;
  rows: ExceedanceRow[];
}

/**
 * Count the readings above the legal limit, broken down by comune.
 *
 * Only defined for pollutants whose limit sits on the same time base as the
 * data. For PM2.5 the limit is an annual mean over a six-month dataset, so the
 * function returns `computable: false` and a reason instead of a number.
 */
export async function getExceedances(
  pollutant: PollutantKey,
  period: Period,
  comune?: string,
): Promise<ExceedanceResult> {
  const cfg = POLLUTANTS[pollutant];
  const base = {
    pollutant,
    limit: cfg.limit,
    unit: cfg.unit,
    period,
  };

  if (comparisonMode(cfg) === "not-computable") {
    return {
      ...base,
      computable: false,
      note: notComputableReason(cfg),
      rows: [],
    };
  }

  const rows = await query<{
    comune: string;
    readings: string;
    exceedances: string;
    max_value: string;
  }>(
    `SELECT s.comune,
            COUNT(*)                                    AS readings,
            COUNT(*) FILTER (WHERE m.value > $4)        AS exceedances,
            MAX(m.value)                                AS max_value
       FROM measurements m
       JOIN sensors s ON s.idsensore = m.idsensore
      WHERE s.pollutant   = $1
        AND m.measured_at >= $2::date
        AND m.measured_at <  $3::date
        AND ($5::text IS NULL OR s.comune = $5)
      GROUP BY s.comune
      ORDER BY exceedances DESC, s.comune`,
    [cfg.sensorType, period.from, period.to, cfg.limit, comune ?? null],
  );

  return {
    ...base,
    computable: true,
    note: null,
    rows: rows.map((r) => ({
      comune: r.comune,
      readings: Number(r.readings),
      exceedances: Number(r.exceedances),
      maxValue: Number(r.max_value),
    })),
  };
}

export interface TrendPoint {
  day: string;
  value: number;
}

export interface TrendResult {
  pollutant: PollutantKey;
  comune: string | null;
  limit: number;
  unit: string;
  period: Period;
  points: TrendPoint[];
}

/**
 * Daily mean over time.
 *
 * Always aggregated to one point per day, including for NO2 and ozone, whose
 * sensors report hourly. Twenty-four points a day is noise on a six-month
 * chart; the exceedance count above is what preserves the hourly detail.
 */
export async function getTrend(
  pollutant: PollutantKey,
  period: Period,
  comune?: string,
): Promise<TrendResult> {
  const cfg = POLLUTANTS[pollutant];

  const rows = await query<{ day: string; value: string }>(
    `SELECT to_char(date_trunc('day', m.measured_at), 'YYYY-MM-DD') AS day,
            AVG(m.value)                                            AS value
       FROM measurements m
       JOIN sensors s ON s.idsensore = m.idsensore
      WHERE s.pollutant   = $1
        AND m.measured_at >= $2::date
        AND m.measured_at <  $3::date
        AND ($4::text IS NULL OR s.comune = $4)
      GROUP BY 1
      ORDER BY 1`,
    [cfg.sensorType, period.from, period.to, comune ?? null],
  );

  return {
    pollutant,
    comune: comune ?? null,
    limit: cfg.limit,
    unit: cfg.unit,
    period,
    points: rows.map((r) => ({ day: r.day, value: Number(r.value) })),
  };
}

export interface ComuneSummary {
  comune: string;
  period: Period;
  pollutants: {
    pollutant: PollutantKey;
    label: string;
    limit: number;
    unit: string;
    computable: boolean;
    note: string | null;
    readings: number;
    exceedances: number;
    mean: number | null;
    maxValue: number | null;
  }[];
}

/** One line per pollutant for a single comune — what the assistant reads out. */
export async function getComuneSummary(
  comune: string,
  period: Period,
): Promise<ComuneSummary> {
  const pollutants = [];

  for (const key of POLLUTANT_KEYS) {
    const cfg = POLLUTANTS[key];
    const [row] = await query<{
      readings: string;
      exceedances: string;
      mean: string | null;
      max_value: string | null;
    }>(
      `SELECT COUNT(*)                             AS readings,
              COUNT(*) FILTER (WHERE m.value > $4) AS exceedances,
              AVG(m.value)                         AS mean,
              MAX(m.value)                         AS max_value
         FROM measurements m
         JOIN sensors s ON s.idsensore = m.idsensore
        WHERE s.pollutant   = $1
          AND m.measured_at >= $2::date
          AND m.measured_at <  $3::date
          AND s.comune      = $5`,
      [cfg.sensorType, period.from, period.to, cfg.limit, comune],
    );

    const computable = comparisonMode(cfg) !== "not-computable";
    pollutants.push({
      pollutant: key,
      label: cfg.label,
      limit: cfg.limit,
      unit: cfg.unit,
      computable,
      note: notComputableReason(cfg),
      readings: Number(row?.readings ?? 0),
      exceedances: computable ? Number(row?.exceedances ?? 0) : 0,
      mean: row?.mean != null ? Number(row.mean) : null,
      maxValue: row?.max_value != null ? Number(row.max_value) : null,
    });
  }

  return { comune, period, pollutants };
}

export interface StationRow {
  idstazione: number;
  stationName: string;
  comune: string;
  provincia: string;
  pollutants: string[];
}

/** The monitoring network: which station measures what, and where. */
export async function getStations(
  comune?: string,
  pollutant?: PollutantKey,
): Promise<StationRow[]> {
  const sensorType = pollutant ? POLLUTANTS[pollutant].sensorType : null;

  const rows = await query<{
    idstazione: number;
    station_name: string;
    comune: string;
    provincia: string;
    pollutants: string[];
  }>(
    `SELECT s.idstazione,
            MIN(s.station_name) AS station_name,
            MIN(s.comune)       AS comune,
            MIN(s.provincia)    AS provincia,
            ARRAY_AGG(DISTINCT s.pollutant) AS pollutants
       FROM sensors s
      WHERE ($1::text IS NULL OR s.comune    = $1)
        AND ($2::text IS NULL OR s.pollutant = $2)
      GROUP BY s.idstazione
      ORDER BY comune, station_name`,
    [comune ?? null, sensorType],
  );

  return rows.map((r) => ({
    idstazione: r.idstazione,
    stationName: r.station_name,
    comune: r.comune,
    provincia: r.provincia,
    pollutants: r.pollutants,
  }));
}

/** Options for the filters, and the real extent of the data. */
export async function getMetadata(): Promise<{
  comuni: string[];
  period: Period;
}> {
  const comuni = await query<{ comune: string }>(
    `SELECT DISTINCT comune FROM sensors ORDER BY comune`,
  );
  const [range] = await query<{ min: string; max: string }>(
    `SELECT to_char(MIN(measured_at), 'YYYY-MM-DD') AS min,
            to_char(MAX(measured_at) + INTERVAL '1 day', 'YYYY-MM-DD') AS max
       FROM measurements`,
  );

  return {
    comuni: comuni.map((c) => c.comune),
    period: { from: range?.min ?? "", to: range?.max ?? "" },
  };
}
