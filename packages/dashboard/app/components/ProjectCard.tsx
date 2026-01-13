import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
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
            {project.isFavorite && (
              <svg
                className="h-4 w-4 text-yellow-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            )}
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
              project.isActive ? "bg-green-400" : "bg-gray-500"
            }`}
          />
          <span>{project.isActive ? "Active" : "Inactive"}</span>
        </div>
        {project.lastOpenedAt && (
          <span>
            Last opened:{" "}
            {new Date(project.lastOpenedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {project.lastError && (
        <div className="mt-3 rounded bg-red-900/30 px-2 py-1 text-xs text-red-400">
          Error: {project.lastError}
        </div>
      )}
    </div>
  );
}
