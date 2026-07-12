import { handleCloudStudyRoute } from "@/lib/cloud/study-route-core";
import { cloudStudyRouteDependencies } from "@/lib/cloud/study-route";
export const maxDuration = 30;
export function GET(request: Request) { return handleCloudStudyRoute(request, cloudStudyRouteDependencies); }
export function POST(request: Request) { return handleCloudStudyRoute(request, cloudStudyRouteDependencies); }
export function PATCH(request: Request) { return handleCloudStudyRoute(request, cloudStudyRouteDependencies); }
export function DELETE(request: Request) { return handleCloudStudyRoute(request, cloudStudyRouteDependencies); }
