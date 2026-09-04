import { NextResponse } from "next/server";
import { getStations } from "@/lib/domain";
import { fail } from "@/lib/http";
import { isPollutantKey } from "@/lib/pollutants";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const p = params.get("pollutant");
  try {
    const result = await getStations(
      params.get("comune") ?? undefined,
      p && isPollutantKey(p) ? p : undefined,
    );
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}
