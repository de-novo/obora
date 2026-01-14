import { NextResponse } from "next/server";
import { z } from "zod";
import { getProjects, createProject } from "@/lib/queries";
import type { ApiResponse } from "@/lib/types";

// Zod 입력 검증 스키마
const CreateProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  path: z.string().min(1, "Path is required").max(500, "Path too long"),
  description: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format").optional(),
  icon: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      isActive: searchParams.get("isActive") === "true" ? true : searchParams.get("isActive") === "false" ? false : undefined,
      isFavorite: searchParams.get("isFavorite") === "true" ? true : searchParams.get("isFavorite") === "false" ? false : undefined,
      search: searchParams.get("search") || undefined,
    };

    const projects = getProjects(filters);

    const response: ApiResponse<typeof projects> = {
      success: true,
      data: projects,
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Zod 검증
    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((e) => e.message).join(", "),
        },
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(response, { status: 400 });
    }

    const project = createProject(parsed.data);

    const response: ApiResponse<typeof project> = {
      success: true,
      data: project,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 201 });
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
