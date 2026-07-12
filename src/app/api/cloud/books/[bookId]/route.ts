import { handleCloudBookResource } from "@/lib/cloud/books-route-core";
import { cloudBooksRouteDependencies } from "@/lib/cloud/books-route";

type Context = { params: Promise<{ bookId: string }> };
export const maxDuration = 180;
async function handle(request: Request, context: Context) { const { bookId } = await context.params; return handleCloudBookResource(request, bookId, cloudBooksRouteDependencies); }
export const GET = handle;
export const PATCH = handle;
export const DELETE = handle;
