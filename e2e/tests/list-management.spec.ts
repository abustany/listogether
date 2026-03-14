import { expect, test } from "fixtures/test";

const ListImportRegexp = /\/import\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("List management", async ({ page }) => {
  await page.goto("/");

  const TestListName = "First list";

  const locateListItem = (text: string) =>
    page.getByRole("list", { name: "Lists" }).getByRole("listitem").filter({ hasText: text });

  let listUrl: string;

  await test.step("Create a list", async () => {
    await expect(locateListItem("No list yet!")).toBeVisible();
    await page.getByRole("button", { name: "New list…" }).click();

    await page.waitForTimeout(100); // Somehow the editor needs some time to wire things up
    await page.getByRole("textbox", { name: "List name" }).fill(TestListName);
    await page.getByRole("link", { name: "Back to lists" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");

    await expect(locateListItem(TestListName)).toBeVisible();
  });

  await test.step("Share a list", async () => {
    await locateListItem(TestListName).getByRole("button", { name: "Share this list" }).click();
    const shareModal = page.getByRole("dialog", { name: "Share list" });
    const shareUrl = shareModal.getByLabel("List share URL");
    await expect(shareUrl).toHaveText(ListImportRegexp);
    listUrl = await shareUrl.innerText();
    await shareModal.getByRole("button", { name: "Close" }).click();
  });

  await test.step("Delete a list", async () => {
    await locateListItem(TestListName).getByRole("button", { name: "Delete this list" }).click();
    await locateListItem(TestListName).getByRole("button", { name: "Click to confirm" }).click();
    await expect(locateListItem("No list yet!")).toBeVisible();
  });

  await test.step("Import a list", async () => {
    await page.getByRole("button", { name: "Import a list…" }).click();
    const importModal = page.getByRole("dialog", { name: "Import list" });
    await importModal.getByRole("textbox", { name: "Sharing URL" }).fill(listUrl);
    await importModal.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText(`Successfully imported list «${TestListName}»`)).toBeVisible();
    await page.getByRole("link", { name: "Back to lists" }).click();
    await expect(locateListItem(TestListName)).toBeVisible();
  });
});
