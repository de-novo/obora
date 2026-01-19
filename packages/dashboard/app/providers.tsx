"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Toaster } from "sonner";
import type { Project } from "@/lib/types";

// ============================================================================
// Theme Context
// ============================================================================

type Theme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

// ============================================================================
// Project Context
// ============================================================================

type ProjectContextType = {
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
};

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return context;
}

function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  return (
    <ProjectContext.Provider value={{ selectedProject, setSelectedProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

// Cache for localStorage reads (vercel-react-best-practices: js-cache-storage)
let cachedTheme: Theme | null = null;

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  if (cachedTheme !== null) return cachedTheme;

  try {
    const stored = localStorage.getItem("theme");
    cachedTheme = stored === "light" || stored === "dark" ? stored : "dark";
  } catch {
    cachedTheme = "dark";
  }
  return cachedTheme;
}

function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy state initialization to read from cache/localStorage once
  // (vercel-react-best-practices: rerender-lazy-state-init)
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Sync with cached value after mount (in case inline script set it)
    const current = getStoredTheme();
    setTheme(current);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);

    // Update both localStorage and cache
    localStorage.setItem("theme", theme);
    cachedTheme = theme;
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000,
            refetchOnWindowFocus: true,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ProjectProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "bg-card border-border text-foreground",
              style: {
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-foreground)",
              },
            }}
          />
        </ProjectProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
