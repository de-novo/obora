import { NextResponse } from "next/server";
import { getAllSessions, getProjectSessions } from "@/lib/queries";
import { getSafeErrorMessage, type ApiResponse } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const limit = searchParams.get("limit");

    const sessions = projectId
      ? getProjectSessions(projectId)
      : getAllSessions(limit ? parseInt(limit, 10) : 50);

    const response: ApiResponse<typeof sessions> = {
      success: true,
      data: sessions,
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
