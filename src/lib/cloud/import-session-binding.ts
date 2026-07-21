import "server-only";

import { getAppSession } from "../auth/app-session";
import { getEdgeOneRuntimeConfig } from "../edgeone/runtime-config";
import {
  createCloudImportSessionBinding,
  verifyCloudImportSessionBinding,
} from "./import-session-binding-core";

export async function getCloudImportSessionBinding(): Promise<string | null> {
  const session = await getAppSession();
  if (!session) return null;
  return createCloudImportSessionBinding({
    userId: session.user.id,
    secret: getEdgeOneRuntimeConfig().sessionSecret,
  });
}

export function isCloudImportSessionBindingValid(userId: string, token: string): boolean {
  try {
    return verifyCloudImportSessionBinding({
      token,
      userId,
      secret: getEdgeOneRuntimeConfig().sessionSecret,
    });
  } catch {
    return false;
  }
}
