"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchProject, fetchSessions, queryKeys } from "@/lib/api";

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: project, isLoading: projectLoading, error: projectError } = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => fetchProject(projectId),
    enabled: !!projectId,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: queryKeys.sessions(projectId),
    queryFn: () => fetchSessions(projectId),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActive = data?.some((s) => s.status === "active");
      return hasActive ? 3000 : false;
    },
  });

  if (projectLoading) {
    return (
      <div className="p-8">
        <div className="mb-4 h-8 w-64 animate-pulse rounded bg-card" />
        <div className="mb-8 h-4 w-96 animate-pulse rounded bg-card" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (projectError || !project) {
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
          <p className="text-muted-foreground">{projectError?.message || "Project not found"}</p>
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
        <span className="text-foreground">{project.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div
            className="size-4 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
        </div>
        {project.description && (
          <p className="mt-2 text-muted-foreground">{project.description}</p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">{project.path}</p>
      </div>

      {/* Sessions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Sessions</h2>

        {sessions.length === 0 ? (
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <h3 className="mb-2 font-medium text-foreground">No sessions yet</h3>
            <p className="text-sm text-muted-foreground">
              Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">obora</code> in
              this project to start a session.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <div className="cursor-pointer rounded-lg bg-card p-4 transition-colors hover:bg-muted">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <div
                          className={`size-2 rounded-full ${getStatusColor(session.status)} ${
                            session.status === "active" ? "animate-pulse" : ""
                          }`}
                        />
                        <span className="text-xs capitalize text-muted-foreground">
                          {session.status}
                        </span>
                      </div>
                      <h3 className="font-medium text-foreground">
                        Session {session.id.slice(0, 8)}
                      </h3>
                      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{session.workflowCount} workflows</span>
                        {session.totalTokens > 0 && (
                          <span>{session.totalTokens.toLocaleString()} tokens</span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {session.startedAt && new Date(session.startedAt).toLocaleString()}
                    </div>
                  </div>
                  {session.summary && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {session.summary}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
