import { NextResponse } from "next/server";
import { getSessionWorkflows, getRecentWorkflows } from "@/lib/queries";
import { getSafeErrorMessage, type ApiResponse } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const projectId = searchParams.get("projectId") || undefined;
    const limit = searchParams.get("limit");

    const workflows = sessionId
      ? getSessionWorkflows(sessionId)
      : getRecentWorkflows(limit ? parseInt(limit, 10) : 20, projectId);

    const response: ApiResponse<typeof workflows> = {
      success: true,
      data: workflows,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: getSafeErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 500 });
  }
}
