"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { WorkflowListItem } from "../components/WorkflowFlow";
import { fetchWorkflows, queryKeys } from "@/lib/api";
import { useProject } from "@/app/providers";

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
    return (
      <div className="p-8">
        <div className="mb-8 h-10 w-48 animate-pulse rounded bg-card" />
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Failed to load workflows</p>
          <p className="text-sm text-muted-foreground/60">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold">Workflows</h1>

      <div className="space-y-2">
        {workflows.map((workflow) => (
          <Link
            key={workflow.id}
            href={`/workflows/${workflow.id}`}
            className="block"
          >
            <WorkflowListItem workflow={workflow} />
          </Link>
        ))}

        {workflows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">No workflows yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
