import { expect, test } from "fixtures/test";

// Browser back/forward navigations go through a different code path than
// in-app links (see ui/src/view-transition.ts).
test("Browser back and forward", async ({ page }) => {
  const TestListName = "Navigation list";
  const listName = page.getByRole("textbox", { name: "List name" });

  await page.goto("/");
  await page.getByRole("button", { name: "New list…" }).click();
  await page.waitForTimeout(100); // Somehow the editor needs some time to wire things up
  await listName.fill(TestListName);

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("link", { name: TestListName })).toBeVisible();

  await page.goForward();
  await expect(listName).toHaveValue(TestListName);
});
