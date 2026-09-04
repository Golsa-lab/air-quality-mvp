"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExceedanceResult, Period, TrendResult } from "@/lib/domain";
import { POLLUTANTS, POLLUTANT_KEYS, type PollutantKey } from "@/lib/pollutants";
import TrendChart from "./TrendChart";
import Assistant from "./Assistant";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Richiesta fallita.");
  return body as T;
}

export default function Dashboard({
  comuni,
  period,
}: {
  comuni: string[];
  period: Period;
}) {
  const [pollutant, setPollutant] = useState<PollutantKey>("PM10");
  const [comune, setComune] = useState("");
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  const [exceedances, setExceedances] = useState<ExceedanceResult | null>(null);
  const [trend, setTrend] = useState<TrendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ pollutant, from, to });
    if (comune) qs.set("comune", comune);
    try {
      const [e, t] = await Promise.all([
        getJSON<ExceedanceResult>(`/api/exceedances?${qs}`),
        getJSON<TrendResult>(`/api/trend?${qs}`),
      ]);
      setExceedances(e);
      setTrend(t);
    } catch (err) {
      setError((err as Error).message);
      setExceedances(null);
      setTrend(null);
    } finally {
      setLoading(false);
    }
  }, [pollutant, comune, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const cfg = POLLUTANTS[pollutant];
  const total = exceedances?.rows.reduce((n, r) => n + r.exceedances, 0) ?? 0;
  const worst = Math.max(1, ...(exceedances?.rows.map((r) => r.exceedances) ?? []));

  return (
    <>
      <div className="controls">
        <label>
          Inquinante
          <select
            value={pollutant}
            onChange={(e) => setPollutant(e.target.value as PollutantKey)}
          >
            {POLLUTANT_KEYS.map((k) => (
              <option key={k} value={k}>
                {POLLUTANTS[k].label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Comune
          <select value={comune} onChange={(e) => setComune(e.target.value)}>
            <option value="">Tutti</option>
            {comuni.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label>
          Dal
          <input
            type="date"
            value={from}
            min={period.from}
            max={period.to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>

        <label>
          Al
          <input
            type="date"
            value={to}
            min={period.from}
            max={period.to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="note">{error}</p>}

      <section className="panel">
        <h2>
          Superamenti — limite {cfg.limit} {cfg.unit}
          {cfg.limitBasis === "hourly" ? " su base oraria" : " su media giornaliera"}
        </h2>

        {loading && <p className="sub">Caricamento…</p>}

        {exceedances && !exceedances.computable && (
          <p className="note">{exceedances.note}</p>
        )}

        {exceedances?.computable && exceedances.rows.length === 0 && (
          <p className="sub">
            Nessuna rilevazione per questo inquinante nel periodo scelto.
            Prova ad allargare l&apos;intervallo di date.
          </p>
        )}

        {exceedances?.computable && exceedances.rows.length > 0 && (
          <>
            <p className="sub">
              <span className={total > 0 ? "over num" : "under num"}>
                {total}
              </span>{" "}
              superamenti su{" "}
              <span className="num">
                {exceedances.rows.reduce((n, r) => n + r.readings, 0)}
              </span>{" "}
              rilevazioni valide.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Comune</th>
                  <th className="r">Superamenti</th>
                  <th className="r">Rilevazioni</th>
                  <th className="r">Massimo</th>
                  <th>Quota sul totale</th>
                </tr>
              </thead>
              <tbody>
                {exceedances.rows.map((r) => (
                  <tr key={r.comune}>
                    <td>{r.comune}</td>
                    <td className={`r num ${r.exceedances > 0 ? "over" : "under"}`}>
                      {r.exceedances}
                    </td>
                    <td className="r num">{r.readings}</td>
                    <td className="r num">{r.maxValue.toFixed(1)}</td>
                    <td>
                      <div className="bar">
                        <span
                          style={{
                            width: `${(r.exceedances / worst) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {trend && trend.points.length > 0 && (
        <section className="panel">
          <h2>
            Media giornaliera{comune ? ` — ${comune}` : ""}
          </h2>
          <TrendChart trend={trend} />
        </section>
      )}

      <section className="panel">
        <h2>Chiedi ai dati</h2>
        <Assistant />
      </section>
    </>
  );
}
