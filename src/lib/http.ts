import { NextResponse } from "next/server";
import { isPollutantKey, type PollutantKey } from "./pollutants";

/**
 * One error shape for every route. The message is safe to show to the user:
 * the domain layer only throws messages written for a person to read.
 */
export function fail(err: unknown, status = 400) {
  const message =
    err instanceof Error ? err.message : "Errore imprevisto.";
  return NextResponse.json({ error: message }, { status });
}

/** Reads a query parameter that must be present. */
export function required(params: URLSearchParams, name: string): string {
  const v = params.get(name);
  if (!v) throw new Error(`Parametro mancante: ${name}`);
  return v;
}

export function pollutantParam(params: URLSearchParams): PollutantKey {
  const p = required(params, "pollutant");
  if (!isPollutantKey(p)) throw new Error(`Inquinante non valido: ${p}`);
  return p;
}

export function periodParams(params: URLSearchParams) {
  return { from: required(params, "from"), to: required(params, "to") };
}
