import { test, expect } from "@playwright/test";
import { navigate } from "./navigation";
test("local field map, attachments, reports and read-only insights work on mobile", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await navigate(page, "Dashboard");
  await page
    .getByRole("button", { name: "Load demo farm", exact: true })
    .click();
  await navigate(page, "Maps");
  await page
    .getByRole("button", { name: "Add field boundary", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Field", exact: true })
    .selectOption({ label: "North 40" });
  await page
    .getByLabel("Boundary name", { exact: true })
    .fill("Fictional north plot");
  await page
    .getByLabel(
      "GeoJSON Polygon / Feature, or closed [longitude,latitude] coordinate ring",
      { exact: true },
    )
    .fill("[[0,0],[1,0],[1,1],[0,1],[0,0]]");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Local field boundary sketch", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Open field Fictional north plot",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "North 40", exact: true }),
  ).toBeVisible();
  const map = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export GeoJSON", exact: true })
    .click();
  expect((await map).suggestedFilename()).toBe("waterturn-fields.geojson");
  await navigate(page, "Documents");
  await page.getByLabel("Add local attachment", { exact: true }).setInputFiles({
    name: "fictional-observation.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Fictional demonstration only."),
  });
  await expect(
    page.getByText("fictional-observation.txt", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await navigate(page, "Documents");
  await expect(
    page.getByText("fictional-observation.txt", { exact: true }),
  ).toBeVisible();
  await navigate(page, "Reports");
  await page
    .getByRole("combobox", { name: "Report", exact: true })
    .selectOption("irrigation");
  await expect(
    page.getByRole("columnheader", { name: "Actual hours", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(
    async () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("waterturn");
        req.onsuccess = () => {
          const get = req.result
            .transaction("state")
            .objectStore("state")
            .get("farm");
          get.onsuccess = () => {
            resolve(JSON.stringify(get.result));
            req.result.close();
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
  await navigate(page, "Assistant");
  await page
    .getByRole("button", { name: "Open local insights", exact: true })
    .click();
  await expect(
    page.getByText("No due maintenance in recorded data.", { exact: true }),
  ).toBeVisible();
  const after = await page.evaluate(
    async () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("waterturn");
        req.onsuccess = () => {
          const get = req.result
            .transaction("state")
            .objectStore("state")
            .get("farm");
          get.onsuccess = () => {
            resolve(JSON.stringify(get.result));
            req.result.close();
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
  expect(after).toBe(before);
  await page.screenshot({
    path: "test-results/farmos-insights-mobile.png",
    fullPage: true,
  });
});
