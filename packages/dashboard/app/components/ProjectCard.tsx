import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const isActive = project.status === "active";

  return (
    <div
      className="group relative rounded-lg border border-gray-700 bg-gray-800 p-4 transition-all hover:border-gray-600 hover:bg-gray-750"
      style={{ borderLeftColor: project.color, borderLeftWidth: "4px" }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white truncate">
              {project.name}
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-400 truncate">{project.path}</p>
          {project.description && (
            <p className="mt-2 text-sm text-gray-300 line-clamp-2">
              {project.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <span
            className={`h-2 w-2 rounded-full ${
              isActive ? "bg-green-400" : "bg-gray-500"
            }`}
          />
          <span>{isActive ? "Active" : "Archived"}</span>
        </div>
        <span>
          Updated: {new Date(project.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
