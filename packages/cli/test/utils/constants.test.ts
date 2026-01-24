import { describe, it, expect } from "vitest";
import {
  BASES,
  APP_MODULES,
  PRESETS,
  CATEGORIES,
  CATEGORY_CONFIGS,
  getPresetsByCategory,
  isExclusiveCategory,
  getAppModuleSlots,
  type BaseName,
  type AppModuleName,
  type PresetName,
  type Category,
} from "../../src/utils/constants";

describe("constants", () => {
  describe("BASES", () => {
    it("should have monorepo base", () => {
      expect(BASES["monorepo"]).toBeDefined();
      expect(BASES["monorepo"].name).toBe("monorepo");
      expect(BASES["monorepo"].description).toContain("Turborepo");
    });

    it("should have single base", () => {
      expect(BASES["single"]).toBeDefined();
      expect(BASES["single"].name).toBe("single");
    });

    it("should have features array for each base", () => {
      Object.values(BASES).forEach((base) => {
        expect(Array.isArray(base.features)).toBe(true);
        expect(base.features.length).toBeGreaterThan(0);
      });
    });
  });

  describe("APP_MODULES", () => {
    it("should have nextjs-web module", () => {
      expect(APP_MODULES["nextjs-web"]).toBeDefined();
      expect(APP_MODULES["nextjs-web"].name).toBe("nextjs-web");
      expect(APP_MODULES["nextjs-web"].targetDir).toBe("apps/web");
    });

    it("should have nestjs-api module", () => {
      expect(APP_MODULES["nestjs-api"]).toBeDefined();
      expect(APP_MODULES["nestjs-api"].name).toBe("nestjs-api");
      expect(APP_MODULES["nestjs-api"].targetDir).toBe("apps/api");
    });

    it("should have features array for each module", () => {
      Object.values(APP_MODULES).forEach((module) => {
        expect(Array.isArray(module.features)).toBe(true);
        expect(module.features.length).toBeGreaterThan(0);
      });
    });

    it("should have slots array for each module", () => {
      Object.values(APP_MODULES).forEach((module) => {
        expect(Array.isArray(module.slots)).toBe(true);
      });
    });

    it("should have valid targetDir for each module", () => {
      Object.values(APP_MODULES).forEach((module) => {
        expect(module.targetDir).toBeDefined();
        expect(module.targetDir.length).toBeGreaterThan(0);
      });
    });
  });

  describe("PRESETS", () => {
    it("should have clerk preset", () => {
      expect(PRESETS.clerk).toBeDefined();
      expect(PRESETS.clerk.category).toBe("auth");
    });

    it("should have drizzle preset", () => {
      expect(PRESETS.drizzle).toBeDefined();
      expect(PRESETS.drizzle.category).toBe("database");
    });

    it("should have polar preset", () => {
      expect(PRESETS.polar).toBeDefined();
      expect(PRESETS.polar.category).toBe("payment");
    });

    it("should have resend preset", () => {
      expect(PRESETS.resend).toBeDefined();
      expect(PRESETS.resend.category).toBe("email");
    });

    it("should have vitest preset", () => {
      expect(PRESETS.vitest).toBeDefined();
      expect(PRESETS.vitest.category).toBe("testing");
    });

    it("should have playwright preset", () => {
      expect(PRESETS.playwright).toBeDefined();
      expect(PRESETS.playwright.category).toBe("testing");
    });

    it("should have zustand preset", () => {
      expect(PRESETS.zustand).toBeDefined();
      expect(PRESETS.zustand.category).toBe("state");
    });

    it("should have jotai preset", () => {
      expect(PRESETS.jotai).toBeDefined();
      expect(PRESETS.jotai.category).toBe("state");
    });

    it("should have react-hook-form preset", () => {
      expect(PRESETS["react-hook-form"]).toBeDefined();
      expect(PRESETS["react-hook-form"].category).toBe("form");
    });

    it("should have shadcn preset", () => {
      expect(PRESETS.shadcn).toBeDefined();
      expect(PRESETS.shadcn.category).toBe("ui");
    });

    it("should have shadcn-all preset", () => {
      expect(PRESETS["shadcn-all"]).toBeDefined();
      expect(PRESETS["shadcn-all"].category).toBe("ui");
    });

    it("should have all presets with valid category", () => {
      Object.values(PRESETS).forEach((preset) => {
        expect(CATEGORIES).toContain(preset.category);
      });
    });

    it("should have description for each preset", () => {
      Object.values(PRESETS).forEach((preset) => {
        expect(preset.description).toBeDefined();
        expect(preset.description.length).toBeGreaterThan(0);
      });
    });

    it("should have version for each preset", () => {
      Object.values(PRESETS).forEach((preset) => {
        expect(preset.version).toBeDefined();
      });
    });
  });

  describe("CATEGORIES", () => {
    it("should include all expected categories", () => {
      const expected = [
        "linting",
        "database",
        "auth",
        "payment",
        "analytics",
        "data-fetching",
        "state",
        "i18n",
        "theming",
        "ui",
        "email",
        "ai",
        "storage",
        "validation",
        "testing",
        "form",
      ];
      expected.forEach((cat) => {
        expect(CATEGORIES).toContain(cat);
      });
    });

    it("should have 16 categories", () => {
      expect(CATEGORIES.length).toBe(16);
    });

    it("should have config for each category", () => {
      CATEGORIES.forEach((cat) => {
        expect(CATEGORY_CONFIGS[cat]).toBeDefined();
        expect(CATEGORY_CONFIGS[cat].name).toBe(cat);
      });
    });
  });

  describe("utility functions", () => {
    it("getPresetsByCategory should return presets for auth category", () => {
      const authPresets = getPresetsByCategory("auth");
      expect(authPresets).toContain("clerk");
      expect(authPresets).toContain("better-auth");
    });

    it("getPresetsByCategory should return presets for database category", () => {
      const dbPresets = getPresetsByCategory("database");
      expect(dbPresets).toContain("drizzle");
      expect(dbPresets).toContain("prisma");
    });

    it("getPresetsByCategory should return presets for testing category", () => {
      const testingPresets = getPresetsByCategory("testing");
      expect(testingPresets).toContain("vitest");
      expect(testingPresets).toContain("playwright");
    });

    it("getPresetsByCategory should return presets for state category", () => {
      const statePresets = getPresetsByCategory("state");
      expect(statePresets).toContain("zustand");
      expect(statePresets).toContain("jotai");
    });

    it("getPresetsByCategory should return presets for form category", () => {
      const formPresets = getPresetsByCategory("form");
      expect(formPresets).toContain("react-hook-form");
    });

    it("getPresetsByCategory should return presets for ui category", () => {
      const uiPresets = getPresetsByCategory("ui");
      expect(uiPresets).toContain("shadcn");
      expect(uiPresets).toContain("shadcn-all");
      expect(uiPresets).toContain("base-ui");
    });

    it("isExclusiveCategory should return true for auth", () => {
      expect(isExclusiveCategory("auth")).toBe(true);
    });

    it("isExclusiveCategory should return false for analytics", () => {
      expect(isExclusiveCategory("analytics")).toBe(false);
    });

    it("isExclusiveCategory should return true for testing", () => {
      expect(isExclusiveCategory("testing")).toBe(true);
    });

    it("isExclusiveCategory should return false for form", () => {
      expect(isExclusiveCategory("form")).toBe(false);
    });

    it("isExclusiveCategory should return false for state", () => {
      expect(isExclusiveCategory("state")).toBe(false);
    });

    it("isExclusiveCategory should return false for ui", () => {
      expect(isExclusiveCategory("ui")).toBe(false);
    });

    it("getAppModuleSlots should return slots for nestjs-api", () => {
      const slots = getAppModuleSlots("nestjs-api");
      expect(slots).toContain("database");
      expect(slots).toContain("email");
      expect(slots).toContain("payment");
    });

    it("getAppModuleSlots should return slots for nextjs-web", () => {
      const slots = getAppModuleSlots("nextjs-web");
      expect(slots).toContain("auth");
      expect(slots).toContain("analytics");
    });
  });

  describe("type safety", () => {
    it("should allow valid base names", () => {
      const validBases: BaseName[] = ["monorepo", "single"];
      validBases.forEach((b) => {
        expect(BASES[b]).toBeDefined();
      });
    });

    it("should allow valid app module names", () => {
      const validModules: AppModuleName[] = ["nextjs-web", "nestjs-api"];
      validModules.forEach((m) => {
        expect(APP_MODULES[m]).toBeDefined();
      });
    });

    it("should allow valid preset names", () => {
      const validPresets: PresetName[] = ["clerk", "drizzle", "polar", "resend"];
      validPresets.forEach((p) => {
        expect(PRESETS[p]).toBeDefined();
      });
    });
  });
});
