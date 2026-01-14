import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/queries";
import type { ApiResponse } from "@/lib/types";

export async function GET() {
  try {
    const stats = getDashboardStats();

    const response: ApiResponse<typeof stats> = {
      success: true,
      data: stats,
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
