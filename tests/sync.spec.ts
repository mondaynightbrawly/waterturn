import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../server/app";
import { database } from "../server/database";
import { hashPassword } from "../server/auth";
import { writeState } from "../server/repository";
import { upgrade, requireFarm } from "../src/farmos/domain";
import { demo } from "../src/demo";
const admin = database(true),
  pool = database();
let server: Server,
  endpoint = "",
  organizationId = "",
  userId = "";
const username = "browser-" + randomUUID(),
  password = randomBytes(24).toString("hex");
test.beforeAll(async () => {
  const data = upgrade(demo()),
    f = requireFarm(data);
  f.organization.name = "Fictional sync farm";
  organizationId = f.organization.id;
  userId = randomUUID();
  await admin.query(
    "INSERT INTO app_users(id,username,password_hash)VALUES($1,$2,$3)",
    [userId, username, await hashPassword(password)],
  );
  const c = await admin.connect();
  try {
    await c.query("BEGIN");
    await c.query("INSERT INTO organizations(id,name)VALUES($1,$2)", [
      organizationId,
      f.organization.name,
    ]);
    await c.query(
      "INSERT INTO memberships(organization_id,user_id,role)VALUES($1,$2,$3)",
      [organizationId, userId, "owner"],
    );
    await c.query(
      "SELECT set_config('app.organization_id',$1,true),set_config('app.role','owner',true)",
      [organizationId],
    );
    await writeState(c, data, organizationId);
    await c.query("COMMIT");
  } finally {
    c.release();
  }
  server = createApp(pool, { origin: "http://127.0.0.1:4173" }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  endpoint = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  const cleanup = await admin.connect();
  await cleanup.query("BEGIN");
  for (const table of [
    "audit_events",
    "command_receipts",
    "record_links",
    "ledger_postings",
    "ledger_journals",
    "records",
    "record_audit",
    "memberships",
  ])
    await cleanup.query("DELETE FROM " + table + " WHERE organization_id=$1", [
      organizationId,
    ]);
  await cleanup.query("DELETE FROM organizations WHERE id=$1", [
    organizationId,
  ]);
  await cleanup.query("DELETE FROM auth_sessions WHERE user_id=$1", [userId]);
  await cleanup.query("DELETE FROM app_users WHERE id=$1", [userId]);
  await cleanup.query("COMMIT");
  cleanup.release();
  await pool.end();
  await admin.end();
});
test("owner imports, queues, detects a competing server change, reconciles and uploads explicitly", async ({
  page,
  context,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await navigate(page, "Administration");
  await page.getByLabel("API address", { exact: true }).fill(endpoint);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const login = page.waitForResponse(
    (r) => r.url() === endpoint + "/login" && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Sign in to local API", exact: true })
    .click();
  const csrf = (await (await login).json()).csrfToken;
  await expect(
    page.getByText("Authenticated. No local farm data has been uploaded.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import server farm locally", exact: true })
    .click();
  await expect(
    page.getByText("Server data saved locally. No local changes uploaded.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit farm", exact: true }).click();
  await page
    .getByLabel("Farm name", { exact: true })
    .fill("Fictional local edit");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page
    .getByRole("button", { name: "Queue current local snapshot", exact: true })
    .click();
  await expect(
    page.getByText("Saved locally · pending sync. Nothing uploaded yet.", {
      exact: true,
    }),
  ).toBeVisible();
  const current = await (
    await context.request.get(
      endpoint + "/organizations/" + organizationId + "/state",
    )
  ).json();
  current.data.farm.organization.name = "Fictional competing change";
  current.data.settings.farmName = "Fictional competing change";
  const competing = await context.request.post(
    endpoint + "/organizations/" + organizationId + "/commands",
    {
      headers: { "X-CSRF-Token": csrf, Origin: "http://127.0.0.1:4173" },
      data: {
        id: randomUUID(),
        kind: "replace-state",
        expectedRevision: current.revision,
        data: current.data,
      },
    },
  );
  expect(competing.status()).toBe(200);
  await page
    .getByRole("button", { name: "Upload queued snapshot", exact: true })
    .click();
  await expect(page.getByText(/Conflict: server changed/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fictional local edit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard pending upload", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import server farm locally", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Queue current local snapshot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Upload queued snapshot", exact: true })
    .click();
  await expect(
    page.getByText(
      "Queued snapshot synchronized. Subsequent local edits require a new queue.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sign out of API", exact: true })
    .click();
  expect((await context.request.get(endpoint + "/session")).status()).toBe(401);
});
