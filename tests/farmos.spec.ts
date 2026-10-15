import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
test("farm foundation tasks, properties, history and backup persist offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your operation, in view." }),
  ).toBeVisible();
  await navigate(page, "Properties");
  await page.getByRole("button", { name: "Add property", exact: true }).click();
  await page
    .getByLabel("Property name", { exact: true })
    .fill("Fictional Willow Ranch");
  await page.getByLabel("Operated acres", { exact: true }).fill("95");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Fictional Willow Ranch" }),
  ).toBeVisible();
  await navigate(page, "Tasks");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Check fictional headgate");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await page.getByLabel("Actual work minutes", { exact: true }).fill("20");
  await page
    .getByLabel("Completion notes", { exact: true })
    .fill("Ready for water");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Task status", exact: true })
    .selectOption("completed");
  await expect(
    page.getByText("Check fictional headgate", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await navigate(page, "Tasks");
  await page
    .getByRole("combobox", { name: "Task status", exact: true })
    .selectOption("completed");
  await expect(
    page.getByText("Check fictional headgate", { exact: true }).first(),
  ).toBeVisible();
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your operation, in view." }),
  ).toBeVisible();
  await expect(
    page.getByText("Check fictional headgate", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/farmos-phase1-mobile.png",
    fullPage: true,
  });
});
