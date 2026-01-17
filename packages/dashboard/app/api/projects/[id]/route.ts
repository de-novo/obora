import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject, updateProject, deleteProject } from "@/lib/queries";
import { getSafeErrorMessage, type ApiResponse } from "@/lib/types";

// Zod 입력 검증 스키마
const UpdateProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long").optional(),
  description: z.string().max(1000, "Description too long").optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format").optional(),
  icon: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const project = getProject(id);

    if (!project) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Project with id ${id} not found`,
        },
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<typeof project> = {
      success: true,
      data: project,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Zod 검증
    const parsed = UpdateProjectSchema.safeParse(body);
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

    const project = updateProject(id, parsed.data);

    if (!project) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Project with id ${id} not found`,
        },
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<typeof project> = {
      success: true,
      data: project,
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = deleteProject(id);

    if (!success) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Project with id ${id} not found`,
        },
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted: true },
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
