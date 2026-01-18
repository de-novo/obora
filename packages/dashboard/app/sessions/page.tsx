"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchSessions, queryKeys } from "@/lib/api";
import { useProject } from "@/app/providers";

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
    return (
      <div className="canvas-grid h-full p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-grid h-full overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          {selectedProject ? (
            <>
              <span
                className="mr-1.5 inline-block size-2 rounded-full align-middle"
                style={{ backgroundColor: selectedProject.color }}
              />
              {selectedProject.name}
            </>
          ) : (
            "All projects"
          )}
          {" · "}
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg bg-card py-12">
          <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
            <svg className="size-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="mb-1 text-sm font-medium text-foreground">No sessions yet</p>
          <p className="text-xs text-muted-foreground">Sessions will appear when you run Claude Code.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`}>
              <div className="flex items-center justify-between rounded-lg bg-card p-3 transition-colors hover:bg-muted">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    <svg className="size-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        Session {session.id.slice(0, 8)}
                      </p>
                      {!selectedProject && session.projectName && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {session.projectName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {session.workflowCount} workflow{session.workflowCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    {session.totalTokens.toLocaleString()} tokens
                  </span>
                  <span className={`size-2 rounded-full ${session.status === "active" ? "bg-info animate-pulse" : "bg-success"}`} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
