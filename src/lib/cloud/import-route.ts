import "server-only";
import { getRouteSession } from "../auth/app-session";
import { getCloudImportService } from "./import";
export const cloudImportRouteDependencies = { getSession: getRouteSession, service: { import: (...args: Parameters<ReturnType<typeof getCloudImportService>["import"]>) => getCloudImportService().import(...args) } };
