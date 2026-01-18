"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchProjects, queryKeys } from "@/lib/api";
import { useTheme } from "@/app/providers";
import type { Project } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Sun, Moon, FolderOpen, Check } from "lucide-react";

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

  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: Project Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Obora</span>
          <span className="text-muted-foreground">/</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1">
                {selectedProject ? (
                  <>
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: selectedProject.color }}
                    />
                    {selectedProject.name}
                  </>
                ) : (
                  <span className="text-muted-foreground">Select project</span>
                )}
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Projects
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projects.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  <FolderOpen className="mx-auto mb-2 size-8 opacity-50" />
                  <p>No projects yet</p>
                  <p className="text-xs">Run <code className="rounded bg-muted px-1">obora init</code></p>
                </div>
              ) : (
                projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => handleProjectSelect(project)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span>{project.name}</span>
                    </div>
                    {selectedProject?.id === project.id && (
                      <Check className="size-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
            <Sun className="size-5" />
          ) : (
            <Moon className="size-5" />
          )}
        </button>
      </div>
    </header>
  );
}
