import { handleCloudTranslationsCollection } from "@/lib/cloud/translations-route-core";
import { cloudTranslationsRouteDependencies } from "@/lib/cloud/translations-route";
export const maxDuration = 30;
export function GET(request: Request) { return handleCloudTranslationsCollection(request, cloudTranslationsRouteDependencies); }
export function POST(request: Request) { return handleCloudTranslationsCollection(request, cloudTranslationsRouteDependencies); }
