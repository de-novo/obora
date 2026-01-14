import { NextResponse } from "next/server";
import { getWorkflowWithDetails } from "@/lib/queries";
import type { ApiResponse } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workflow = getWorkflowWithDetails(id);

    if (!workflow) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Workflow not found",
        },
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<typeof workflow> = {
      success: true,
      data: workflow,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 500 });
  }
}
