"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApiResponse } from "@/lib/types";
import type { DashboardStats } from "@/lib/queries";

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch("/api/stats");
        const data: ApiResponse<DashboardStats> = await response.json();

        if (data.success && data.data) {
          setStats(data.data);
        } else {
          setError(data.error?.message || "Failed to fetch stats");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="canvas-grid h-full p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-card" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-card" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="canvas-grid flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-error">
            <svg className="mx-auto size-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">{error}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-grid h-full overflow-auto p-6">
      {/* Stats Row */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-card p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Projects
          </div>
          <div className="text-2xl font-semibold text-primary">
            {stats?.totalProjects ?? 0}
          </div>
        </div>

        <div className="rounded-lg bg-card p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Active Sessions
          </div>
          <div className="text-2xl font-semibold text-primary">
            {stats?.activeSessions ?? 0}
          </div>
        </div>

        <div className="rounded-lg bg-card p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total Workflows
          </div>
          <div className="text-2xl font-semibold text-primary">
            {stats?.totalWorkflows ?? 0}
          </div>
        </div>

        <div className="rounded-lg bg-card p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total Tokens
          </div>
          <div className="text-2xl font-semibold text-primary">
            {formatTokens(stats?.totalTokens ?? 0)}
          </div>
        </div>
      </div>

      {/* Recent Workflows */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Recent Workflows</h2>
          <Link href="/workflows" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>

        {!stats?.recentWorkflows || stats.recentWorkflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg bg-card py-12">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
              <svg className="size-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
              </svg>
            </div>
            <p className="mb-1 text-sm font-medium text-foreground">No workflows yet</p>
            <p className="text-xs text-muted-foreground">
              Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">obora run</code> to execute workflows.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.recentWorkflows.map((workflow) => (
              <Link key={workflow.id} href={`/workflows/${workflow.id}`}>
                <div className="flex items-center justify-between rounded-lg bg-card p-3 transition-colors hover:bg-muted">
                  <div className="flex items-center gap-3">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: workflow.projectColor }}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">{workflow.name}</p>
                      <p className="text-xs text-muted-foreground">{workflow.projectName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{workflow.stepCount} steps</span>
                    <span className={`size-2 rounded-full ${workflow.status === "completed" ? "bg-success" : workflow.status === "running" ? "bg-info animate-pulse" : workflow.status === "failed" ? "bg-error" : "bg-muted-foreground"}`} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
