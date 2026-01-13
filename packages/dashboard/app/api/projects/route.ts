import { NextResponse } from "next/server";
import { getProjects, createProject } from "@/lib/queries";
import type { ApiResponse, CreateProjectInput } from "@/lib/types";

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
    const body = await request.json() as CreateProjectInput;

    if (!body.name || !body.path) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Name and path are required",
        },
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(response, { status: 400 });
    }

    const project = createProject(body);

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
