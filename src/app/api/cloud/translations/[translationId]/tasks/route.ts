import { handleCloudTranslationTasks } from "@/lib/cloud/translations-route-core";
import { cloudTranslationsRouteDependencies } from "@/lib/cloud/translations-route";
export const maxDuration = 30;
export async function GET(request: Request, context: { params: Promise<{ translationId: string }> }) { const { translationId } = await context.params; return handleCloudTranslationTasks(request, translationId, cloudTranslationsRouteDependencies); }
