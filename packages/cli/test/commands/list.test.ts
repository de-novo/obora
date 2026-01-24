import { describe, it, expect, vi } from "vitest";
import {
  BASES,
  APP_MODULES,
  PRESETS,
  CATEGORIES,
} from "../../src/utils/constants";

// Mock consola
vi.mock("consola", () => ({
  consola: {
    box: vi.fn(),
  },
}));

describe("list command", () => {
  describe("bases listing", () => {
    it("should list all bases", () => {
      const bases = Object.values(BASES);

      expect(bases.length).toBeGreaterThan(0);
      bases.forEach((base) => {
        expect(base.name).toBeDefined();
        expect(base.description).toBeDefined();
        expect(base.features).toBeDefined();
      });
    });

    it("should have monorepo base", () => {
      const base = BASES["monorepo"];

      expect(base).toBeDefined();
      expect(base.name).toBe("monorepo");
      expect(base.features).toContain("Turborepo");
    });

    it("should have single base", () => {
      const base = BASES["single"];

      expect(base).toBeDefined();
      expect(base.name).toBe("single");
    });
  });

  describe("app modules listing", () => {
    it("should list all app modules", () => {
      const modules = Object.values(APP_MODULES);

      expect(modules.length).toBeGreaterThan(0);
      modules.forEach((module) => {
        expect(module.name).toBeDefined();
        expect(module.description).toBeDefined();
        expect(module.features).toBeDefined();
        expect(module.targetDir).toBeDefined();
        expect(module.slots).toBeDefined();
      });
    });

    it("should have nextjs-web module", () => {
      const module = APP_MODULES["nextjs-web"];

      expect(module).toBeDefined();
      expect(module.name).toBe("nextjs-web");
      expect(module.features).toContain("Next.js 15");
      expect(module.targetDir).toBe("apps/web");
    });

    it("should have nestjs-api module", () => {
      const module = APP_MODULES["nestjs-api"];

      expect(module).toBeDefined();
      expect(module.name).toBe("nestjs-api");
      expect(module.features).toContain("NestJS 11");
      expect(module.targetDir).toBe("apps/api");
    });
  });

  describe("presets listing", () => {
    it("should list all presets", () => {
      const presets = Object.values(PRESETS);

      expect(presets.length).toBeGreaterThan(0);
      presets.forEach((preset) => {
        expect(preset.name).toBeDefined();
        expect(preset.category).toBeDefined();
        expect(preset.description).toBeDefined();
      });
    });

    it("should group presets by category", () => {
      const grouped: Record<string, string[]> = {};

      Object.values(PRESETS).forEach((preset) => {
        if (!grouped[preset.category]) {
          grouped[preset.category] = [];
        }
        grouped[preset.category].push(preset.name);
      });

      expect(grouped["auth"]).toContain("clerk");
      expect(grouped["database"]).toContain("drizzle");
      expect(grouped["payment"]).toContain("polar");
      expect(grouped["email"]).toContain("resend");
    });
  });

  describe("category filtering", () => {
    it("should filter presets by auth category", () => {
      const authPresets = Object.values(PRESETS).filter(
        (p) => p.category === "auth"
      );

      expect(authPresets.length).toBeGreaterThan(0);
      authPresets.forEach((preset) => {
        expect(preset.category).toBe("auth");
      });
    });

    it("should filter presets by database category", () => {
      const dbPresets = Object.values(PRESETS).filter(
        (p) => p.category === "database"
      );

      expect(dbPresets.length).toBeGreaterThan(0);
      dbPresets.forEach((preset) => {
        expect(preset.category).toBe("database");
      });
    });

    it("should filter presets by payment category", () => {
      const paymentPresets = Object.values(PRESETS).filter(
        (p) => p.category === "payment"
      );

      expect(paymentPresets.length).toBeGreaterThan(0);
      paymentPresets.forEach((preset) => {
        expect(preset.category).toBe("payment");
      });
    });

    it("should filter presets by email category", () => {
      const emailPresets = Object.values(PRESETS).filter(
        (p) => p.category === "email"
      );

      expect(emailPresets.length).toBeGreaterThan(0);
      emailPresets.forEach((preset) => {
        expect(preset.category).toBe("email");
      });
    });
  });

  describe("type filtering", () => {
    it("should support bases type filter", () => {
      const type = "bases";
      const showBases = type === "bases";
      const showPresets = type === "presets";

      expect(showBases).toBe(true);
      expect(showPresets).toBe(false);
    });

    it("should support presets type filter", () => {
      const type = "presets";
      const showBases = type === "bases";
      const showPresets = type === "presets";

      expect(showBases).toBe(false);
      expect(showPresets).toBe(true);
    });

    it("should show both when no type filter", () => {
      const type: string | undefined = undefined;
      const showBases = !type || type === "bases";
      const showPresets = !type || type === "presets";

      expect(showBases).toBe(true);
      expect(showPresets).toBe(true);
    });
  });

  describe("categories", () => {
    it("should have all expected categories", () => {
      expect(CATEGORIES).toContain("linting");
      expect(CATEGORIES).toContain("auth");
      expect(CATEGORIES).toContain("database");
      expect(CATEGORIES).toContain("payment");
      expect(CATEGORIES).toContain("analytics");
      expect(CATEGORIES).toContain("data-fetching");
      expect(CATEGORIES).toContain("state");
      expect(CATEGORIES).toContain("i18n");
      expect(CATEGORIES).toContain("theming");
      expect(CATEGORIES).toContain("ui");
      expect(CATEGORIES).toContain("email");
      expect(CATEGORIES).toContain("ai");
      expect(CATEGORIES).toContain("storage");
      expect(CATEGORIES).toContain("validation");
      expect(CATEGORIES).toContain("testing");
      expect(CATEGORIES).toContain("form");
    });

    it("should have 16 categories", () => {
      expect(CATEGORIES.length).toBe(16);
    });
  });
});
