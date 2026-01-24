import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("should load successfully", async ({ page }) => {
    await page.goto("/");

    // Check page title
    await expect(page).toHaveTitle(/.*/);

    // Check main content is visible
    await expect(page.locator("main")).toBeVisible();
  });

  test("should have proper heading", async ({ page }) => {
    await page.goto("/");

    // Check heading
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
  });

  test("should be responsive", async ({ page }) => {
    await page.goto("/");

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator("main")).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator("main")).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator("main")).toBeVisible();
  });
});
