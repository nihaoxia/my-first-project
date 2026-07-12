import { handleCloudBookDownload } from "@/lib/cloud/books-route-core";
import { cloudBooksRouteDependencies } from "@/lib/cloud/books-route";

export const maxDuration = 90;

export async function GET(request: Request, context: { params: Promise<{ bookId: string }> }) { const { bookId } = await context.params; return handleCloudBookDownload(request, bookId, cloudBooksRouteDependencies); }
