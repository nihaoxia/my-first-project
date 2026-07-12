import "server-only";
import { getAppSession } from "../auth/app-session";
import { getCloudImportService } from "./import";
export const cloudImportRouteDependencies = { getSession: getAppSession, service: { import: (...args: Parameters<ReturnType<typeof getCloudImportService>["import"]>) => getCloudImportService().import(...args) } };
