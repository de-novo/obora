"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Zap, ChevronRight, Coins, GitBranch } from "lucide-react";
import { fetchSessions, queryKeys } from "@/lib/api";
import { useProject } from "@/app/providers";

// Hoisted static JSX elements (vercel-react-best-practices: rendering-hoist-jsx)
const sessionSkeletons = Array.from({ length: 5 }, (_, i) => (
  <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
));

const loadingSkeleton = (
  <div className="h-full p-6 lg:p-8">
    <div className="mb-6 h-8 w-32 animate-pulse rounded bg-card" />
    <div className="space-y-3">{sessionSkeletons}</div>
  </div>
);

const emptySessionsPlaceholder = (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
    <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
      <Zap className="size-6 text-muted-foreground" />
    </div>
    <p className="mb-1 font-medium text-foreground">No sessions yet</p>
    <p className="text-sm text-muted-foreground">Sessions will appear when you run Claude Code.</p>
  </div>
);

export default function SessionsPage() {
  const { selectedProject } = useProject();
  const projectId = selectedProject?.id;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.sessions(projectId),
    queryFn: () => fetchSessions(projectId),
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActive = data?.some((s) => s.status === "active");
      return hasActive ? 3000 : false;
    },
  });

  if (isLoading) {
    return loadingSkeleton;
  }

  return (
    <div className="h-full overflow-auto p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold lg:text-3xl">Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedProject ? (
            <span className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: selectedProject.color }}
              />
              {selectedProject.name}
              <span className="text-muted-foreground/60">·</span>
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </span>
          ) : (
            `All projects · ${sessions.length} session${sessions.length !== 1 ? "s" : ""}`
          )}
        </p>
      </div>

      {sessions.length === 0 ? (
        emptySessionsPlaceholder
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`}>
              <div className="group flex items-center justify-between rounded-xl border border-border bg-card/50 p-4 transition-all hover:border-primary/30 hover:bg-card">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex size-10 items-center justify-center rounded-xl ${
                      session.status === "active" ? "bg-blue-500/10" : "bg-green-500/10"
                    }`}
                  >
                    <Zap
                      className={`size-5 ${
                        session.status === "active" ? "text-blue-400" : "text-green-400"
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">
                        Session {session.id.slice(0, 8)}
                      </p>
                      {session.status === "active" && (
                        <span className="flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                          <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
                          Active
                        </span>
                      )}
                      {!selectedProject && session.projectName && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {session.projectName}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <GitBranch className="size-3" />
                        {session.workflowCount} workflow{session.workflowCount !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Coins className="size-3" />
                        {session.totalTokens.toLocaleString()} tokens
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="size-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
