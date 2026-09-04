import { NextResponse } from "next/server";
import { getExceedances } from "@/lib/domain";
import { fail, periodParams, pollutantParam } from "@/lib/http";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    const result = await getExceedances(
      pollutantParam(params),
      periodParams(params),
      params.get("comune") ?? undefined,
    );
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}
