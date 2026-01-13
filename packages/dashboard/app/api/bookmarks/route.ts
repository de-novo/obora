import { NextResponse } from "next/server";
import { getBookmarks, createBookmark } from "@/lib/queries";
import type { ApiResponse, CreateBookmarkInput, BookmarkEntityType } from "@/lib/types";

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
        message: error instanceof Error ? error.message : "Unknown error",
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateBookmarkInput;

    if (!body.projectId || !body.entityType || !body.entityId) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "projectId, entityType, and entityId are required",
        },
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(response, { status: 400 });
    }

    const bookmark = createBookmark(body);

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
        message: error instanceof Error ? error.message : "Unknown error",
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 500 });
  }
}
