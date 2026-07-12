import { handleCloudImportRoute } from "@/lib/cloud/import-route-core";
import { cloudImportRouteDependencies } from "@/lib/cloud/import-route";
export const maxDuration = 60;
export function POST(request: Request) { return handleCloudImportRoute(request, cloudImportRouteDependencies); }
