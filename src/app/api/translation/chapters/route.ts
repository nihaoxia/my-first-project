import { NextResponse, type NextRequest } from "next/server";

import { getAppSession } from "@/lib/auth/app-session";
import { handleTranslateChapter } from "@/lib/translation/translation-api-service";

export async function POST(request: NextRequest) {
  const session = await getAppSession();
  const body = await readJsonBody(request);
  const result = await handleTranslateChapter({
    body,
    sessionScope: session?.user.id ?? null,
    origin: request.headers.get("origin"),
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    env: process.env,
    signal: request.signal,
  });

  return NextResponse.json(result.body, { status: result.status });
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return null;
  }

  try {
    return await request.json();
  } catch {
    return null;
  }
}
