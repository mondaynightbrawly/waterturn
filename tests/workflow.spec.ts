import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
test("field to water move to durable backup, history and offline shell", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await navigate(page, "Dashboard");
  await navigate(page, "Fields");
  await page.getByRole("button", { name: "+ Add source", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test Canal");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "+ Add field", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test Field");
  await page.getByLabel("Crop", { exact: true }).fill("Corn");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  for (const name of ["Set A", "Set B"]) {
    await page
      .getByRole("button", { name: "+ Add irrigation set", exact: true })
      .click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Save", exact: true }).click();
  }
  await navigate(page, "Dashboard");
  await page
    .getByRole("button", { name: "Start Water", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirm Start", exact: true })
    .click();
  await expect(page.getByText("Water running", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Elapsed irrigation time")).toContainText(
    "0h 0m",
  );
  await page.getByRole("button", { name: "Move Water", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Irrigation set", exact: true }),
  ).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Confirm Move", exact: true }).click();
  await expect(page.locator(".session .setname")).toHaveText("Set B");
  await page.getByRole("button", { name: "Stop Water", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Stop", exact: true }).click();
  await navigate(page, "History");
  await expect(page.locator(".historyrow")).toHaveCount(2);
  await navigate(page, "Settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON backup", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("waterturn-backup.json");
  await page.reload();
  await navigate(page, "History");
  await expect(page.locator(".historyrow")).toHaveCount(2);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await navigate(page, "History");
  await expect(page.locator(".historyrow")).toHaveCount(2);
  await expect(page.getByText("Offline mode", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
});

test("fictional demo, warnings, pause/resume, import replacement and mobile/desktop views", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Dashboard");
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Load demo farm", exact: true })
    .click();
  await expect(page.locator(".session")).toHaveCount(2);
  await expect(
    page.getByText("Planned move overdue", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "test-results/desktop-dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Pause water", exact: true })
    .first()
    .click();
  await expect(page.getByText("Water paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume water", exact: true }).click();
  await expect(page.getByText("Water running", { exact: true })).toBeVisible();
  await navigate(page, "Schedule");
  await expect(
    page.getByText("⚠ Schedule conflict · review source capacity").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "7-day calendar", exact: true })
    .click();
  await expect(page.locator(".week > section")).toHaveCount(7);
  await navigate(page, "Settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON backup", exact: true })
    .click();
  const file = await download;
  await file.saveAs("/tmp/waterturn-e2e-backup.json");
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Unsupported backup version",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles("/tmp/waterturn-e2e-backup.json");
  await expect(
    page.getByText("Review replacement", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm full replacement", exact: true })
    .click();
  await expect(
    page.getByText("Review replacement", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await navigate(page, "Dashboard");
  await expect(page.locator(".session")).toHaveCount(2);
});
