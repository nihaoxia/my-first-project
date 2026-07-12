import { handleCloudTranslationTaskAction } from "@/lib/cloud/translations-route-core";
import { cloudTranslationsRouteDependencies } from "@/lib/cloud/translations-route";
export const maxDuration = 360;
export async function POST(request: Request, context: { params: Promise<{ translationId: string; taskId: string }> }) { const { translationId, taskId } = await context.params; return handleCloudTranslationTaskAction(request, translationId, taskId, cloudTranslationsRouteDependencies); }
