import { NextResponse } from "next/server";
import { getMetadata } from "@/lib/domain";
import { fail } from "@/lib/http";

export async function GET() {
  try {
    return NextResponse.json(await getMetadata());
  } catch (err) {
    return fail(err);
  }
}
