import { NextResponse } from "next/server";
import { ask } from "@/lib/assistant";
import { fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.question !== "string" || !body.question.trim()) {
      throw new Error("Serve una domanda.");
    }
    if (!process.env.LLM_API_KEY) {
      throw new Error(
        "LLM_API_KEY non configurata. Vedi .env.example nel README.",
      );
    }
    const reply = await ask(body.question, body.history ?? []);
    return NextResponse.json(reply);
  } catch (err) {
    return fail(err, 500);
  }
}
