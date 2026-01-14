"use client";

import { useEffect, useState } from "react";
import type { Project, ApiResponse } from "@/lib/types";

export function Header() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isConnected] = useState(true);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch("/api/projects");
        const data: ApiResponse<Project[]> = await response.json();
        if (data.success && data.data && data.data.length > 0) {
          setProjects(data.data);
          setSelectedProject(data.data[0]);
        }
      } catch {
        // Ignore
      }
    }
    fetchProjects();
  }, []);

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

      {/* Right: Stats */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{projects.length} projects</span>
      </div>
    </header>
  );
}
