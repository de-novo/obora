"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { FolderOpen, Zap, GitBranch, Coins, ChevronRight, Clock } from "lucide-react";
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

// Hoisted static JSX elements (vercel-react-best-practices: rendering-hoist-jsx)
// Avoids recreating these elements on every render
const statSkeletons = Array.from({ length: 4 }, (_, i) => (
  <div key={i} className="h-28 animate-pulse rounded-xl bg-card" />
));

const loadingSkeleton = (
  <div className="p-6 lg:p-8">
    <div className="mb-6 h-8 w-48 animate-pulse rounded bg-card" />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
      {statSkeletons}
    </div>
  </div>
);

const emptyWorkflowsPlaceholder = (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8">
    <GitBranch className="mb-2 size-8 text-muted-foreground/50" />
    <p className="text-sm text-muted-foreground">No workflows yet</p>
    <p className="mt-1 text-xs text-muted-foreground/60">
      Run <code className="rounded bg-muted px-1">/obora-workflow</code> to get started
    </p>
  </div>
);

const statsConfig = [
  {
    key: "projects",
    label: "Projects",
    icon: FolderOpen,
    getValue: (stats: any) => stats.totalProjects,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    key: "sessions",
    label: "Active Sessions",
    icon: Zap,
    getValue: (stats: any) => stats.activeSessions,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
  },
  {
    key: "workflows",
    label: "Workflows",
    icon: GitBranch,
    getValue: (stats: any) => stats.totalWorkflows,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    key: "tokens",
    label: "Total Tokens",
    icon: Coins,
    getValue: (stats: any) => formatTokens(stats.totalTokens),
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
];

export default function DashboardPage() {
  const { selectedProject } = useProject();
  const projectId = selectedProject?.id;

  const { data: stats, isLoading, error } = useQuery({
    queryKey: queryKeys.stats(projectId),
    queryFn: () => fetchStats(projectId),
    refetchInterval: 5000, // 5초마다 갱신
  });

  if (isLoading) {
    return loadingSkeleton;
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
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold lg:text-3xl">Dashboard</h1>
        {selectedProject && (
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: selectedProject.color }}
            />
            {selectedProject.name}
          </p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:mb-8 lg:grid-cols-4 lg:gap-6">
        {statsConfig.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.key}
              className="group rounded-xl border border-border bg-card/50 p-4 transition-colors hover:bg-card lg:p-6"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground lg:text-sm">{stat.label}</p>
                <div className={`flex size-8 items-center justify-center rounded-lg ${stat.bgColor}`}>
                  <Icon className={`size-4 ${stat.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold lg:text-3xl">{stat.getValue(stats)}</p>
            </div>
          );
        })}
      </div>

      {/* Recent Workflows */}
      <div className="rounded-xl border border-border bg-card/50 p-4 lg:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <h2 className="font-semibold lg:text-lg">Recent Workflows</h2>
          </div>
          <Link
            href="/workflows"
            className="flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80 lg:text-sm"
          >
            View all
            <ChevronRight className="size-3 lg:size-4" />
          </Link>
        </div>

        {stats.recentWorkflows.length === 0 ? (
          emptyWorkflowsPlaceholder
        ) : (
          <div className="space-y-2">
            {stats.recentWorkflows.map((workflow) => (
              <Link
                key={workflow.id}
                href={`/workflows/${workflow.id}`}
                className="group flex items-center justify-between rounded-lg border border-transparent p-3 transition-all hover:border-border hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-8 items-center justify-center rounded-lg ${
                      workflow.status === "completed"
                        ? "bg-green-500/10"
                        : workflow.status === "running"
                          ? "bg-blue-500/10"
                          : workflow.status === "failed"
                            ? "bg-red-500/10"
                            : "bg-muted"
                    }`}
                  >
                    <GitBranch
                      className={`size-4 ${
                        workflow.status === "completed"
                          ? "text-green-400"
                          : workflow.status === "running"
                            ? "text-blue-400"
                            : workflow.status === "failed"
                              ? "text-red-400"
                              : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{workflow.name || "Untitled"}</p>
                      {workflow.projectName && (
                        <span className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: workflow.projectColor }}
                          />
                          {workflow.projectName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{workflow.type}</span>
                      {workflow.cwd && (
                        <span className="truncate text-muted-foreground/60" title={workflow.cwd}>
                          · {workflow.cwd.split("/").slice(-2).join("/")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
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
                  <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
