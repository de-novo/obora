import { NextResponse } from "next/server";
import { getSessionWithProject, getSessionWorkflows } from "@/lib/queries";
import { getSafeErrorMessage, type ApiResponse } from "@/lib/types";

interface SessionDetailResponse {
  session: NonNullable<ReturnType<typeof getSessionWithProject>>;
  workflows: ReturnType<typeof getSessionWorkflows>;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = getSessionWithProject(id);

    if (!session) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Session not found",
        },
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(response, { status: 404 });
    }

    const workflows = getSessionWorkflows(id);

    const response: ApiResponse<SessionDetailResponse> = {
      success: true,
      data: {
        session,
        workflows,
      },
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
