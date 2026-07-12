import { NextResponse } from "next/server";

import { getAppSession } from "@/lib/auth/app-session";
import { handleTranslationCapabilities } from "@/lib/translation/translation-api-service";

export async function GET() {
  const session = await getAppSession();
  const result = await handleTranslationCapabilities({
    sessionScope: session?.user.id ?? null,
    env: process.env,
  });

  return NextResponse.json(result.body, { status: result.status });
}
