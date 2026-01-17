import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/queries";
import { getSafeErrorMessage, type ApiResponse } from "@/lib/types";

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
        message: getSafeErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 500 });
  }
}
