"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchProjects, queryKeys } from "@/lib/api";
import { useTheme } from "@/app/providers";
import type { Project } from "@/lib/types";

export function Header() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const isConnected = true;
  const { theme, toggleTheme } = useTheme();

  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: fetchProjects,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      setSelectedProject(projects[0]);
    }
  }, [projects, selectedProject]);

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: Project Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Obora</span>
          <span className="text-muted-foreground">/</span>
          {selectedProject ? (
            <button className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-foreground hover:bg-muted">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: selectedProject.color }}
              />
              {selectedProject.name}
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">Select project</span>
          )}
        </div>
      </div>

      {/* Center: Connection Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
          <span className={`size-2 rounded-full ${isConnected ? "bg-success" : "bg-error"}`} />
          <span className="text-muted-foreground">{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      {/* Right: Stats & Theme Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{projects.length} projects</span>
        <button
          onClick={toggleTheme}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          ) : (
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
