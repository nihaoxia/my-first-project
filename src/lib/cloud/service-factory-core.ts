import {
  resolveEdgeOneRuntimeConfig,
  type EdgeOneRuntimeConfig,
} from "../edgeone/runtime-config-core.ts";

export type ProductionCloudServiceFactories<T> = {
  edgeone(config: EdgeOneRuntimeConfig): T;
  prisma(): unknown;
  supabase(): unknown;
  cos(): unknown;
  sms(): unknown;
  mcp(): unknown;
};

export function createProductionCloudServices<T>(input: {
  environment: Record<string, string | undefined>;
  factories: ProductionCloudServiceFactories<T>;
}): T {
  const resolved = resolveEdgeOneRuntimeConfig(input.environment);
  if (!resolved.ok) {
    throw Object.assign(new Error(resolved.error.code), {
      code: resolved.error.code,
      invalidKeys: resolved.error.invalidKeys,
      missingKeys: resolved.error.missingKeys,
    });
  }
  return input.factories.edgeone(resolved.config);
}
