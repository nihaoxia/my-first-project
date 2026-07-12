import "server-only";

import { resolveEdgeOneRuntimeConfig } from "./runtime-config-core";

export function getEdgeOneRuntimeConfig() {
  const result = resolveEdgeOneRuntimeConfig(process.env);
  if (!result.ok) {
    throw Object.assign(new Error(result.error.code), {
      code: result.error.code,
      invalidKeys: result.error.invalidKeys,
      missingKeys: result.error.missingKeys,
    });
  }
  return result.config;
}
