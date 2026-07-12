import { handleCloudBooksCollection } from "@/lib/cloud/books-route-core";
import { cloudBooksRouteDependencies } from "@/lib/cloud/books-route";

export const maxDuration = 180;

export function GET(request: Request) { return handleCloudBooksCollection(request, cloudBooksRouteDependencies); }
export function POST(request: Request) { return handleCloudBooksCollection(request, cloudBooksRouteDependencies); }
