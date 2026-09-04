"use client";

import { useState } from "react";
import type { AssistantReply, ChatMessage, ToolTrace } from "@/lib/assistant";

interface Turn extends ChatMessage {
  trace?: ToolTrace[];
}

const EXAMPLES = [
  "Quali comuni hanno superato il limite PM10 a marzo?",
  "L'ozono è peggiorato in estate rispetto alla primavera?",
  "Com'è messa Monza?",
];

export default function Assistant() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: q }]);
    setQuestion("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Richiesta fallita.");
      const reply = body as AssistantReply;
      setTurns((t) => [
        ...t,
        { role: "assistant", content: reply.answer, trace: reply.trace },
      ]);
    } catch (err) {
      setTurns((t) => [
        ...t,
        { role: "assistant", content: (err as Error).message },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {turns.length === 0 && (
        <p className="sub">
          Fammi delle domande in italiano e ti risponderò in base ai dati disponibili nel nestro database !
          Ogni numero che vedrai comparire è un riferimento ai dati del database. Per esempio:{" "}
          {EXAMPLES.map((e, i) => (
            <span key={e}>
              {i > 0 && " · "}
              <button
                type="button"
                onClick={() => void send(e)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ink)",
                  textDecoration: "underline",
                  padding: 0,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                {e}
              </button>
            </span>
          ))}
        </p>
      )}

      {turns.map((t, i) => (
        <div className="msg" key={i}>
          <div className="who">{t.role === "user" ? "Domanda" : "Risposta"}</div>
          {t.content}
          {t.trace && t.trace.length > 0 && (
            <div className="trace">
              Dati letti tramite: {t.trace.map((c) => c.name).join(", ")}
            </div>
          )}
        </div>
      ))}

      <div className="ask" style={{ marginTop: "1rem" }}>
        <input
          type="text"
          value={question}
          placeholder="Scrivi una domanda…"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send(question);
          }}
        />
        <button onClick={() => void send(question)} disabled={busy || !question.trim()}>
          {busy ? "Cerco…" : "Chiedi"}
        </button>
      </div>
    </>
  );
}
