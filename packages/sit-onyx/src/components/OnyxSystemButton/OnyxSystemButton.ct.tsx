import type { ScreenshotTestHooks } from "@sit-onyx/playwright-utils";
import { expect, test } from "../../playwright/a11y.js";
import { executeMatrixScreenshotTest, mockPlaywrightIcon } from "../../playwright/screenshots.js";
import OnyxSystemButton from "./OnyxSystemButton.vue";
import { SYSTEM_BUTTON_COLORS } from "./types.js";

const hooks: ScreenshotTestHooks<string, string> = {
  beforeEach: async (component, page, column, row) => {
    if (row === "hover") await component.hover();
    if (row === "focus-visible") await page.keyboard.press("Tab");
    if (row === "active") {
      const box = (await component.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
    }
  },
};

test.beforeEach(async ({ page }) => {
  await page.addStyleTag({
    content: `body {
    background-color: var(--onyx-color-base-background-tinted);
  }`,
  });
});

for (const color of SYSTEM_BUTTON_COLORS) {
  test.describe(`Screenshot tests (${color})`, () => {
    executeMatrixScreenshotTest({
      name: `System button (${color})`,
      columns: ["text", "icon", "link"],
      rows: ["default", "hover", "active", "focus-visible", "skeleton"],
      hooks,
      component: (column, row) => (
        <OnyxSystemButton
          label="Test label"
          icon={column === "icon" ? mockPlaywrightIcon : undefined}
          skeleton={row === "skeleton"}
          color={color}
          link={column === "link" ? "#test" : undefined}
        />
      ),
    });

    executeMatrixScreenshotTest({
      name: `System button (${color}, disabled)`,
      columns: ["text", "icon"],
      rows: ["default", "hover", "active", "focus-visible"],
      hooks,
      component: (column) => (
        <OnyxSystemButton
          label="Test label"
          icon={column === "icon" ? mockPlaywrightIcon : undefined}
          color={color}
          disabled
        />
      ),
    });
  });
}

test("should behave as link", async ({ mount, page }) => {
  // ARRANGE
  const component = await mount(
    <OnyxSystemButton label="Test label" icon={mockPlaywrightIcon} link="#test-section" />,
  );

  // ASSERT
  await expect(component).toHaveRole("link");
  await expect(component).toHaveAccessibleName("Test label");

  // ACT
  await component.click();

  // ASSERT
  await expect(page).toHaveURL(/^http:\/\/localhost:\d*\/#test-section$/);
});
