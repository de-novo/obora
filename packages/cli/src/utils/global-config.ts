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
  // Global Preferences
  getPreference,
  setPreference,
  getAllPreferences,
  setPreferences,
  deletePreference,
  clearAllPreferences,
} from "@obora/project-config";

export type { GlobalPreferences, GlobalPreferenceKey } from "@obora/project-config";
