"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchStats, queryKeys } from "@/lib/api";
import { useProject } from "@/app/providers";

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
  const { selectedProject } = useProject();
  const projectId = selectedProject?.id;

  const { data: stats, isLoading, error } = useQuery({
    queryKey: queryKeys.stats(projectId),
    queryFn: () => fetchStats(projectId),
    refetchInterval: 5000, // 5초마다 갱신
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="mb-8 h-10 w-64 animate-pulse rounded bg-card" />
        <div className="grid grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Failed to load dashboard</p>
          <p className="text-sm text-muted-foreground/60">{error?.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold">Dashboard</h1>

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-4 gap-6">
        <div className="rounded-xl border border-border bg-card/50 p-6">
          <p className="text-sm text-muted-foreground">Projects</p>
          <p className="text-3xl font-bold">{stats.totalProjects}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-6">
          <p className="text-sm text-muted-foreground">Active Sessions</p>
          <p className="text-3xl font-bold">{stats.activeSessions}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-6">
          <p className="text-sm text-muted-foreground">Workflows</p>
          <p className="text-3xl font-bold">{stats.totalWorkflows}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-6">
          <p className="text-sm text-muted-foreground">Total Tokens</p>
          <p className="text-3xl font-bold">{formatTokens(stats.totalTokens)}</p>
        </div>
      </div>

      {/* Recent Workflows */}
      <div className="rounded-xl border border-border bg-card/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Workflows</h2>
          <Link href="/workflows" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {stats.recentWorkflows.map((workflow) => (
            <Link
              key={workflow.id}
              href={`/workflows/${workflow.id}`}
              className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/50"
            >
              <div>
                <p className="font-medium">{workflow.name}</p>
                <p className="text-sm text-muted-foreground">{workflow.type}</p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  workflow.status === "completed"
                    ? "bg-green-500/20 text-green-400"
                    : workflow.status === "running"
                      ? "bg-blue-500/20 text-blue-400"
                      : workflow.status === "failed"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {workflow.status}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
