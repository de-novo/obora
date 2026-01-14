"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WorkflowListItem } from "@/app/components/WorkflowFlow";
import type { Session, Workflow, ApiResponse } from "@/lib/types";

interface SessionDetailData {
  session: Session & { projectName: string; projectColor: string };
  workflows: Workflow[];
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [data, setData] = useState<SessionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        const result: ApiResponse<SessionDetailData> = await response.json();

        if (result.success && result.data) {
          setData(result.data);
        } else {
          setError(result.error?.message || "Failed to fetch session");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    if (sessionId) {
      fetchData();
    }
  }, [sessionId]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-4 h-8 w-64 animate-pulse rounded bg-card" />
        <div className="mb-8 h-4 w-96 animate-pulse rounded bg-card" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg bg-card p-6 text-center">
          <svg
            className="mx-auto mb-4 size-12 text-error"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-muted-foreground">{error || "Session not found"}</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { session, workflows } = data;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-info";
      case "completed": return "bg-success";
      case "failed": return "bg-error";
      default: return "bg-muted-foreground";
    }
  };

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Dashboard
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <Link
          href={`/projects/${session.projectId}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {session.projectName}
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span className="text-foreground">Session</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div
            className="size-3 rounded-full"
            style={{ backgroundColor: session.projectColor }}
          />
          <h1 className="text-2xl font-bold text-foreground">
            Session {session.id.slice(0, 8)}
          </h1>
          <div className="flex items-center gap-2 rounded-full bg-card px-3 py-1">
            <div
              className={`size-2 rounded-full ${getStatusColor(session.status)} ${
                session.status === "active" ? "animate-pulse" : ""
              }`}
            />
            <span className="text-xs capitalize text-muted-foreground">
              {session.status}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <svg
              className="size-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              Started {session.startedAt && new Date(session.startedAt).toLocaleString()}
            </span>
          </div>
          {session.endedAt && (
            <div className="flex items-center gap-2">
              <span>Ended {new Date(session.endedAt).toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <svg
              className="size-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
            <span>{session.totalTokens.toLocaleString()} tokens</span>
          </div>
        </div>

        {session.summary && (
          <p className="mt-4 text-muted-foreground">{session.summary}</p>
        )}
      </div>

      {/* Workflows */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Workflows ({workflows.length})
        </h2>

        {workflows.length === 0 ? (
          <div className="rounded-lg bg-card p-8 text-center">
            <svg
              className="mx-auto mb-4 size-12 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
              />
            </svg>
            <h3 className="mb-2 font-medium text-foreground">
              No workflows in this session
            </h3>
          </div>
        ) : (
          <div className="space-y-3">
            {workflows.map((workflow) => (
              <Link key={workflow.id} href={`/workflows/${workflow.id}`}>
                <WorkflowListItem
                  workflow={{
                    id: workflow.id,
                    name: workflow.name,
                    type: workflow.type,
                    status: workflow.status,
                    startedAt: workflow.startedAt,
                    tokensUsed: workflow.tokensUsed,
                    stepCount: 0,
                    sessionId: workflow.sessionId,
                    projectId: session.projectId,
                    projectName: session.projectName,
                    projectColor: session.projectColor,
                  }}
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
