"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import { WorkflowListItem } from "../components/WorkflowFlow";
import { fetchWorkflows, queryKeys } from "@/lib/api";
import { useProject } from "@/app/providers";

// Hoisted static JSX elements (vercel-react-best-practices: rendering-hoist-jsx)
const workflowSkeletons = Array.from({ length: 8 }, (_, i) => (
  <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
));

const loadingSkeleton = (
  <div className="p-6 lg:p-8">
    <div className="mb-6 h-8 w-40 animate-pulse rounded bg-card" />
    <div className="space-y-3">{workflowSkeletons}</div>
  </div>
);

const emptyWorkflowsPlaceholder = (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
    <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
      <GitBranch className="size-6 text-muted-foreground" />
    </div>
    <p className="mb-1 font-medium text-foreground">No workflows yet</p>
    <p className="text-sm text-muted-foreground">
      Run <code className="rounded bg-muted px-1.5 py-0.5">/obora-workflow</code> to get started
    </p>
  </div>
);

export default function WorkflowsPage() {
  const { selectedProject } = useProject();
  const projectId = selectedProject?.id;

  const { data: workflows = [], isLoading, error } = useQuery({
    queryKey: queryKeys.workflows(50, projectId),
    queryFn: () => fetchWorkflows(50, projectId),
    refetchInterval: (query) => {
      // 진행 중인 워크플로우가 있으면 2초마다 갱신
      const data = query.state.data;
      const hasRunning = data?.some((w) => w.status === "running" || w.status === "planning");
      return hasRunning ? 2000 : false;
    },
  });

  if (isLoading) {
    return loadingSkeleton;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-red-500/10 mx-auto">
            <GitBranch className="size-6 text-red-400" />
          </div>
          <p className="font-medium text-foreground">Failed to load workflows</p>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold lg:text-3xl">Workflows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedProject ? (
            <span className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: selectedProject.color }}
              />
              {selectedProject.name}
              <span className="text-muted-foreground/60">·</span>
              {workflows.length} workflow{workflows.length !== 1 ? "s" : ""}
            </span>
          ) : (
            `All projects · ${workflows.length} workflow${workflows.length !== 1 ? "s" : ""}`
          )}
        </p>
      </div>

      {workflows.length === 0 ? (
        emptyWorkflowsPlaceholder
      ) : (
        <div className="space-y-3">
          {workflows.map((workflow) => (
            <Link
              key={workflow.id}
              href={`/workflows/${workflow.id}`}
              className="block"
            >
              <WorkflowListItem workflow={workflow} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
