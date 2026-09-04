/**
 * The assistant loop.
 *
 * Written with plain fetch rather than a provider SDK: the whole mechanism is
 * about twenty lines and staying explicit makes it obvious that the model never
 * touches the data. The endpoint is OpenAI-compatible, so switching provider is
 * a change of base URL and model name.
 */

import { TOOL_SCHEMAS, runTool } from "./tools";

const BASE_URL =
  process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
const MODEL = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";

/** Stops a malformed conversation from looping forever. */
const MAX_STEPS = 5;

const SYSTEM_PROMPT = `
Sei l'assistente di uno strumento di monitoraggio della qualità dell'aria per
un comune lombardo. Rispondi in italiano, in modo breve e concreto.

Regole:
- Ogni numero che citi deve provenire da uno strumento. Non stimare, non usare
  conoscenze generali sull'inquinamento, non inventare valori.
- Se una domanda non indica un periodo, chiama get_metadata e usa l'intero
  periodo disponibile, dicendo all'utente qual è.
- Se uno strumento risponde che un valore non è calcolabile, spiega il motivo
  all'utente invece di aggirare il problema con un altro calcolo.
- Se la domanda non riguarda i dati sulla qualità dell'aria, dillo.
`.trim();

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
}

export interface AssistantReply {
  answer: string;
  /** Which tools were used — shown in the UI so the answer is auditable. */
  trace: ToolTrace[];
}

interface ApiMessage {
  role: string;
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

async function callModel(messages: ApiMessage[]) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOL_SCHEMAS,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices[0].message as ApiMessage;
}

export async function ask(
  question: string,
  history: ChatMessage[] = [],
): Promise<AssistantReply> {
  const messages: ApiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  const trace: ToolTrace[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callModel(messages);
    messages.push(reply);

    const calls = reply.tool_calls ?? [];
    if (calls.length === 0) {
      return { answer: reply.content ?? "", trace };
    }

    // Run every requested tool and feed the results back for the next turn.
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      let result: unknown;
      try {
        args = JSON.parse(call.function.arguments || "{}");
        result = await runTool(call.function.name, args);
      } catch (err) {
        result = { error: (err as Error).message };
      }
      trace.push({ name: call.function.name, args });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    answer:
      "Non sono riuscito a completare la richiesta. Prova a formularla in modo più specifico.",
    trace,
  };
}
