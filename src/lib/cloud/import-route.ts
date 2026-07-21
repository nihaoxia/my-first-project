import "server-only";
import { getRouteSession } from "../auth/app-session";
import { getCloudImportService } from "./import";
import { isCloudImportSessionBindingValid } from "./import-session-binding";
export const cloudImportRouteDependencies = {
  getSession: getRouteSession,
  verifySessionBinding: isCloudImportSessionBindingValid,
  service: { import: (...args: Parameters<ReturnType<typeof getCloudImportService>["import"]>) => getCloudImportService().import(...args) },
};
