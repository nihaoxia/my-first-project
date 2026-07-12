import "server-only";

import {
  resolveCloudServerConfig,
  type CloudServerConfigEnvironment,
  type CloudServerConfigResult,
} from "./server-config-core.ts";

export function getCloudServerConfig(
  environment: CloudServerConfigEnvironment = process.env,
): CloudServerConfigResult {
  return resolveCloudServerConfig(environment);
}
