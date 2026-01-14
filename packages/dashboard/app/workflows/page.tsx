"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WorkflowListItem } from "../components/WorkflowFlow";
import type { ApiResponse } from "@/lib/types";
import type { WorkflowSummary } from "@/lib/queries";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWorkflows() {
      try {
        const response = await fetch("/api/workflows?limit=50");
        const data: ApiResponse<WorkflowSummary[]> = await response.json();

        if (data.success && data.data) {
          setWorkflows(data.data);
        } else {
          setError(data.error?.message || "Failed to fetch workflows");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchWorkflows();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-8 h-10 w-48 animate-pulse rounded bg-card" />
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
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
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
        <p className="text-muted-foreground">
          All workflow executions across your projects
        </p>
      </div>

      {/* Workflows List */}
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
            No workflows yet
          </h3>
          <p className="text-sm text-muted-foreground">
            Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">obora run</code> or{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">obora chat</code> to
            execute workflows.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((workflow) => (
            <Link key={workflow.id} href={`/workflows/${workflow.id}`}>
              <WorkflowListItem workflow={workflow} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
