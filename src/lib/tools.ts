/**
 * The tools the assistant is allowed to call.
 *
 * The model never sees the database and never writes SQL. It only chooses a
 * tool and fills in its arguments; every number in the final answer comes back
 * from the domain layer. Adding a capability to the assistant means adding one
 * entry here — nothing else changes.
 */

import {
  getComuneSummary,
  getExceedances,
  getMetadata,
  getStations,
  getTrend,
} from "./domain";
import { POLLUTANT_KEYS, isPollutantKey } from "./pollutants";

const pollutantParam = {
  type: "string",
  enum: POLLUTANT_KEYS,
  description: "Sigla dell'inquinante.",
} as const;

const dateParam = (what: string) => ({
  type: "string",
  description: `${what} in formato YYYY-MM-DD.`,
});

export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "get_metadata",
      description:
        "Elenco dei comuni disponibili e periodo effettivamente coperto dai " +
        "dati. Da chiamare per primo quando l'utente non indica un periodo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exceedances",
      description:
        "Conta le rilevazioni oltre il limite di legge per un inquinante, " +
        "raggruppate per comune. Da usare per domande su superamenti.",
      parameters: {
        type: "object",
        properties: {
          pollutant: pollutantParam,
          from: dateParam("Inizio del periodo, incluso"),
          to: dateParam("Fine del periodo, esclusa"),
          comune: {
            type: "string",
            description: "Se omesso, restituisce tutti i comuni.",
          },
        },
        required: ["pollutant", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trend",
      description:
        "Serie della media giornaliera di un inquinante nel periodo. " +
        "Da usare per domande su andamenti, aumenti o diminuzioni.",
      parameters: {
        type: "object",
        properties: {
          pollutant: pollutantParam,
          from: dateParam("Inizio del periodo, incluso"),
          to: dateParam("Fine del periodo, esclusa"),
          comune: { type: "string", description: "Se omesso, tutti i comuni." },
        },
        required: ["pollutant", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_comune_summary",
      description:
        "Quadro completo di un singolo comune: per ogni inquinante media, " +
        "massimo e numero di superamenti nel periodo.",
      parameters: {
        type: "object",
        properties: {
          comune: { type: "string", description: "Nome del comune." },
          from: dateParam("Inizio del periodo, incluso"),
          to: dateParam("Fine del periodo, esclusa"),
        },
        required: ["comune", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stations",
      description:
        "Stazioni di monitoraggio e inquinanti misurati da ciascuna.",
      parameters: {
        type: "object",
        properties: {
          comune: { type: "string" },
          pollutant: pollutantParam,
        },
      },
    },
  },
] as const;

type Args = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/**
 * Run one tool call.
 *
 * Arguments arrive from a language model, so they are validated here rather
 * than trusted. An invalid argument becomes an error message handed back to the
 * model, which can then correct itself, instead of an exception that kills the
 * request.
 */
export async function runTool(name: string, args: Args): Promise<unknown> {
  const period = () => {
    const from = str(args.from);
    const to = str(args.to);
    if (!from || !to) throw new Error("Servono sia 'from' che 'to'.");
    return { from, to };
  };

  const pollutant = () => {
    const p = str(args.pollutant);
    if (!p || !isPollutantKey(p)) {
      throw new Error(
        `Inquinante non valido. Valori ammessi: ${POLLUTANT_KEYS.join(", ")}.`,
      );
    }
    return p;
  };

  switch (name) {
    case "get_metadata":
      return getMetadata();
    case "get_exceedances":
      return getExceedances(pollutant(), period(), str(args.comune));
    case "get_trend":
      return getTrend(pollutant(), period(), str(args.comune));
    case "get_comune_summary": {
      const comune = str(args.comune);
      if (!comune) throw new Error("Serve il nome del comune.");
      return getComuneSummary(comune, period());
    }
    case "get_stations": {
      const p = str(args.pollutant);
      return getStations(
        str(args.comune),
        p && isPollutantKey(p) ? p : undefined,
      );
    }
    default:
      throw new Error(`Strumento sconosciuto: ${name}`);
  }
}
