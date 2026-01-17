import { NextResponse } from "next/server";
import { z } from "zod";
import { getBookmarks, createBookmark } from "@/lib/queries";
import { getSafeErrorMessage, type ApiResponse, type BookmarkEntityType } from "@/lib/types";

// Zod 입력 검증 스키마
const CreateBookmarkSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  entityType: z.enum(["session", "workflow", "step", "agent_run", "task"], "Invalid entity type"),
  entityId: z.string().min(1, "Entity ID is required"),
  displayName: z.string().max(200, "Display name too long").optional(),
  notes: z.string().max(1000, "Notes too long").optional(),
  pinned: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      projectId: searchParams.get("projectId") || undefined,
      entityType: (searchParams.get("entityType") as BookmarkEntityType) || undefined,
      pinned: searchParams.get("pinned") === "true" ? true : searchParams.get("pinned") === "false" ? false : undefined,
    };

    const bookmarks = getBookmarks(filters);

    const response: ApiResponse<typeof bookmarks> = {
      success: true,
      data: bookmarks,
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Zod 검증
    const parsed = CreateBookmarkSchema.safeParse(body);
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

    const bookmark = createBookmark(parsed.data);

    const response: ApiResponse<typeof bookmark> = {
      success: true,
      data: bookmark,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 201 });
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
