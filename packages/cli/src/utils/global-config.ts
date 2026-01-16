/**
 * Global Obora Configuration
 *
 * Re-exports from @obora/project-config for backward compatibility.
 * New code should import directly from @obora/project-config.
 */

export {
  getOboraDir,
  getDashboardDbPath,
  initializeGlobalConfig,
  getGlobalDb,
  registerProject,
  getRegisteredProjects,
  resetGlobalConfigState,
} from "@obora/project-config";
