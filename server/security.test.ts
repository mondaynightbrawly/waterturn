import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { randomUUID, randomBytes } from "node:crypto";
import { database, migrate } from "./database.ts";
import { hashPassword } from "./auth.ts";
import { createApp } from "./app.ts";
import { writeState } from "./repository.ts";
import { demo } from "../src/demo.ts";
import { upgrade, requireFarm, base } from "../src/farmos/domain.ts";
import { ops, addExpense } from "../src/farmos/operations.ts";
const pool = database(),
  admin = database(true),
  app = createApp(pool);
const orgs: string[] = [],
  userIds: string[] = [];
const logins = new Map<string, { cookie: string; csrf: string }>();
let first: ReturnType<typeof upgrade>,
  second: ReturnType<typeof upgrade>,
  taskId = "",
  otherTaskId = "";
beforeAll(async () => {
  await migrate();
  for (let i = 0; i < 2; i++) {
    const d = addExpense(upgrade(demo()), {
        enterpriseId: "",
        fieldId: "",
        assetId: "",
        amountCents: 100,
        description: "Fictional financial row",
        category: "Test",
        contact: "",
        at: Date.now(),
      }),
      f = requireFarm(d);
    f.organization.name = "Fictional security farm " + i;
    ops(f).assets.push({
      ...base(f),
      name: "Fictional tractor",
      category: "Tractor",
      make: "",
      model: "",
      year: 2026,
      serial: "",
      location: "",
      purchaseCents: 12000000,
      hours: 10,
      miles: 0,
      status: "available",
      notes: "",
    });
    const worker = {
      ...base(f),
      name: "Fictional worker",
      kind: "employee" as const,
    };
    f.workers.push(worker);
    for (let n = 0; n < 2; n++)
      f.tasks.push({
        ...base(f),
        title: "Fictional task " + n,
        description: "",
        status: "open",
        priority: "normal",
        dueAt: Date.now(),
        workerId: n === 0 ? worker.id : "",
        fieldId: d.fields[0].id,
        assetId: "",
        estimatedMinutes: 20,
        actualMinutes: 0,
        notes: "",
        repeatDays: 0,
      });
    orgs.push(f.organization.id);
    const c = await admin.connect();
    try {
      await c.query("BEGIN");
      await c.query("INSERT INTO organizations(id,name)VALUES($1,$2)", [
        f.organization.id,
        f.organization.name,
      ]);
      await c.query(
        "SELECT set_config('app.organization_id',$1,true),set_config('app.role','owner',true)",
        [f.organization.id],
      );
      await writeState(c, d, f.organization.id);
      await c.query("COMMIT");
    } finally {
      c.release();
    }
    if (i === 0) {
      first = d;
      taskId = f.tasks[0].id;
      otherTaskId = f.tasks[1].id;
    } else second = d;
  }
  for (const role of [
    "owner",
    "manager",
    "employee",
    "accountant",
    "readonly",
  ]) {
    const id = randomUUID(),
      username = "test-" + role + "-" + id,
      password = randomBytes(24).toString("hex");
    userIds.push(id);
    await admin.query(
      "INSERT INTO app_users(id,username,password_hash)VALUES($1,$2,$3)",
      [id, username, await hashPassword(password)],
    );
    await admin.query(
      "INSERT INTO memberships(organization_id,user_id,role,worker_id)VALUES($1,$2,$3,$4)",
      [orgs[0], id, role, requireFarm(first).workers[0].id],
    );
    const res = await request(app)
      .post("/login")
      .set("Origin", "http://127.0.0.1:5173")
      .send({ username, password });
    expect(res.status).toBe(200);
    logins.set(role, {
      cookie: res.headers["set-cookie"][0].split(";")[0],
      csrf: res.body.csrfToken,
    });
  }
});
afterAll(async () => {
  const cleanup = await admin.connect();
  await cleanup.query("BEGIN");
  for (const org of orgs) {
    await cleanup.query("DELETE FROM audit_events WHERE organization_id=$1", [
      org,
    ]);
    await cleanup.query(
      "DELETE FROM command_receipts WHERE organization_id=$1",
      [org],
    );
    await cleanup.query("DELETE FROM record_links WHERE organization_id=$1", [
      org,
    ]);
    await cleanup.query(
      "DELETE FROM ledger_postings WHERE organization_id=$1",
      [org],
    );
    await cleanup.query(
      "DELETE FROM ledger_journals WHERE organization_id=$1",
      [org],
    );
    await cleanup.query("DELETE FROM records WHERE organization_id=$1", [org]);
    await cleanup.query("DELETE FROM record_audit WHERE organization_id=$1", [
      org,
    ]);
    await cleanup.query("DELETE FROM memberships WHERE organization_id=$1", [
      org,
    ]);
    await cleanup.query("DELETE FROM organizations WHERE id=$1", [org]);
  }
  for (const id of userIds) {
    await cleanup.query("DELETE FROM auth_sessions WHERE user_id=$1", [id]);
    await cleanup.query("DELETE FROM app_users WHERE id=$1", [id]);
  }
  await cleanup.query("COMMIT");
  cleanup.release();
  await pool.end();
  await admin.end();
});
const get = (role: string, url: string) =>
  request(app).get(url).set("Cookie", logins.get(role)!.cookie);
const command = (role: string, body: object) =>
  request(app)
    .post("/organizations/" + orgs[0] + "/commands")
    .set("Cookie", logins.get(role)!.cookie)
    .set("X-CSRF-Token", logins.get(role)!.csrf)
    .set("Origin", "http://127.0.0.1:5173")
    .send(body);
it("requires authentication and rejects all cross-organization direct API reads", async () => {
  expect(
    (await request(app).get("/organizations/" + orgs[0] + "/state")).status,
  ).toBe(401);
  for (const role of logins.keys()) {
    expect(
      (await get(role, "/organizations/" + orgs[1] + "/state")).status,
    ).toBe(403);
    expect(
      (await get(role, "/organizations/" + orgs[1] + "/records/fields")).status,
    ).toBe(403);
  }
});
it("enforces owner/manager/employee/accountant/readonly scopes and strips financial columns", async () => {
  for (const role of ["manager", "employee", "accountant", "readonly"])
    expect(
      (await get(role, "/organizations/" + orgs[0] + "/state")).status,
    ).toBe(403);
  const manager = await get(
    "manager",
    "/organizations/" + orgs[0] + "/records/assets",
  );
  expect(manager.status).toBe(200);
  expect(JSON.stringify(manager.body)).not.toContain("purchaseCents");
  expect(
    (await get("manager", "/organizations/" + orgs[0] + "/reports/financial"))
      .status,
  ).toBe(403);
  expect(
    (
      await get(
        "accountant",
        "/organizations/" + orgs[0] + "/reports/financial",
      )
    ).status,
  ).toBe(200);
  expect(
    (await get("readonly", "/organizations/" + orgs[0] + "/records/fields"))
      .status,
  ).toBe(200);
  expect(
    (await get("readonly", "/organizations/" + orgs[0] + "/records/journals"))
      .status,
  ).toBe(403);
  const tasks = await get(
    "employee",
    "/organizations/" + orgs[0] + "/records/tasks",
  );
  expect(tasks.body.records).toHaveLength(1);
  expect(tasks.body.records[0].id).toBe(taskId);
  expect(
    (await get("employee", "/organizations/" + orgs[0] + "/records/documents"))
      .status,
  ).toBe(403);
});
it("checks CSRF and origin; refuses stale revision and wrong-tenant replacement", async () => {
  const state = await get("owner", "/organizations/" + orgs[0] + "/state");
  const body = {
    id: randomUUID(),
    kind: "replace-state",
    expectedRevision: state.body.revision,
    data: state.body.data,
  };
  expect(
    (
      await request(app)
        .post("/organizations/" + orgs[0] + "/commands")
        .set("Cookie", logins.get("owner")!.cookie)
        .send(body)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/organizations/" + orgs[0] + "/commands")
        .set("Origin", "https://untrusted.example")
        .send(body)
    ).status,
  ).toBe(403);
  expect(
    (await command("owner", { ...body, id: randomUUID(), expectedRevision: 0 }))
      .status,
  ).toBe(409);
  expect(
    (await command("owner", { ...body, id: randomUUID(), data: second }))
      .status,
  ).toBe(403);
});
it("completes only assigned tasks and returns idempotent receipts", async () => {
  const state = await get("owner", "/organizations/" + orgs[0] + "/state");
  const body = {
    id: randomUUID(),
    kind: "complete-task",
    expectedRevision: state.body.revision,
    taskId,
    minutes: 15,
    notes: "Fictional completion",
  };
  const firstResult = await command("employee", body);
  expect(firstResult.status).toBe(200);
  const retry = await command("employee", body);
  expect(retry.body).toEqual(firstResult.body);
  expect((await command("employee", { ...body, minutes: 30 })).status).toBe(
    409,
  );
  expect(
    (
      await command("employee", {
        ...body,
        id: randomUUID(),
        expectedRevision: firstResult.body.revision,
        taskId: otherTaskId,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await command("accountant", {
        ...body,
        id: randomUUID(),
        expectedRevision: firstResult.body.revision,
        taskId: otherTaskId,
      })
    ).status,
  ).toBe(403);
  const employee = (await get("employee", "/session")).body.userId;
  const changes = await admin.query(
    "SELECT actor_user_id,command_id,before_hash,after_hash FROM record_audit WHERE organization_id=$1 AND kind='tasks' AND record_id=$2 AND action='UPDATE' AND command_id=$3",
    [orgs[0], taskId, body.id],
  );
  expect(changes.rows).toHaveLength(1);
  expect(changes.rows[0].actor_user_id).toBe(employee);
  expect(changes.rows[0].before_hash).not.toBe(changes.rows[0].after_hash);
  const audit = await get("owner", "/organizations/" + orgs[0] + "/audit");
  expect(
    audit.body.events.filter(
      (a: { command_id: string }) => a.command_id === body.id,
    ),
  ).toHaveLength(1);
});
it("database role cannot bypass RLS or create cross-tenant relational links", async () => {
  const c = await pool.connect();
  try {
    const role = (
      await c.query(
        "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    await c.query("BEGIN");
    await c.query(
      "SELECT set_config('app.organization_id',$1,true),set_config('app.role','owner',true)",
      [orgs[0]],
    );
    expect(
      (
        await c.query("SELECT * FROM records WHERE organization_id=$1", [
          orgs[1],
        ])
      ).rows,
    ).toHaveLength(0);
    await c.query("SAVEPOINT link_test");
    await expect(
      c.query("INSERT INTO record_links VALUES($1,$2,$3,$4,$5,$6)", [
        orgs[0],
        "tasks",
        taskId,
        "cross-test",
        "assets",
        ops(requireFarm(second)).assets[0].id,
      ]),
    ).resolves.toBeDefined();
    await expect(c.query("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toThrow();
    await c.query("ROLLBACK TO SAVEPOINT link_test");
    await c.query("ROLLBACK");
  } finally {
    c.release();
  }
});
it("revocation immediately blocks an existing authenticated session", async () => {
  const before = await get("readonly", "/session");
  await admin.query(
    "UPDATE memberships SET active=false WHERE organization_id=$1 AND user_id=$2",
    [orgs[0], before.body.userId],
  );
  expect(
    (await get("readonly", "/organizations/" + orgs[0] + "/records/fields"))
      .status,
  ).toBe(403);
  await admin.query("DELETE FROM auth_sessions WHERE user_id=$1", [
    before.body.userId,
  ]);
  expect((await get("readonly", "/session")).status).toBe(401);
});

it("restores a real PostgreSQL backup into an isolated temporary database", async () => {
  const name = "farmos_restore_" + randomUUID().replaceAll("-", "");
  const dump = spawnSync(
    "docker",
    [
      "exec",
      "waterturn-farmos-db",
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "farmos",
      "-Fc",
    ],
    { maxBuffer: 50 * 1024 * 1024 },
  );
  expect(dump.status).toBe(0);
  await admin.query("CREATE DATABASE " + name);
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  url.pathname = "/" + name;
  const restored = new Pool({ connectionString: url.href });
  try {
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        "waterturn-farmos-db",
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        name,
        "--no-owner",
      ],
      { input: dump.stdout, maxBuffer: 5 * 1024 * 1024 },
    );
    expect(result.status).toBe(0);
    expect(
      Number(
        (await restored.query("SELECT count(*) FROM organizations")).rows[0]
          .count,
      ),
    ).toBe(
      Number(
        (await admin.query("SELECT count(*) FROM organizations")).rows[0].count,
      ),
    );
    expect(
      (
        await restored.query(
          "SELECT payload FROM records WHERE organization_id=$1 AND kind=$2",
          [orgs[0], "fields"],
        )
      ).rows.map((r) => r.payload),
    ).toEqual(
      (
        await admin.query(
          "SELECT payload FROM records WHERE organization_id=$1 AND kind=$2",
          [orgs[0], "fields"],
        )
      ).rows.map((r) => r.payload),
    );
  } finally {
    await restored.end();
    await admin.query("DROP DATABASE " + name);
  }
});

it("only owners administer memberships, cannot remove the last owner, and may grant manager financial read scope", async () => {
  const owner = (await get("owner", "/session")).body;
  const base = {
    action: "update",
    userId: owner.userId,
    role: "manager",
    workerId: "",
    active: true,
    scopes: [],
  };
  const write = (role: string, body: object) =>
    request(app)
      .post("/organizations/" + orgs[0] + "/members")
      .set("Cookie", logins.get(role)!.cookie)
      .set("X-CSRF-Token", logins.get(role)!.csrf)
      .send(body);
  expect((await write("owner", base)).status).toBe(400);
  expect((await write("manager", base)).status).toBe(403);
  const manager = (await get("manager", "/session")).body;
  expect(
    (
      await write("owner", {
        ...base,
        userId: manager.userId,
        role: "manager",
        scopes: ["finance:read"],
      })
    ).status,
  ).toBe(200);
  expect(
    (await get("manager", "/organizations/" + orgs[0] + "/reports/financial"))
      .status,
  ).toBe(200);
  expect(
    (
      await write("owner", {
        ...base,
        userId: manager.userId,
        role: "manager",
        scopes: [],
      })
    ).status,
  ).toBe(200);
  expect(
    (await get("manager", "/organizations/" + orgs[0] + "/reports/financial"))
      .status,
  ).toBe(403);
});
it("the database rejects unbalanced financial journals independently of application validation", async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "SELECT set_config('app.organization_id',$1,true),set_config('app.role','owner',true)",
      [orgs[0]],
    );
    const id = randomUUID();
    await c.query("INSERT INTO ledger_journals VALUES($1,$2,now(),$3)", [
      orgs[0],
      id,
      "Fictional invalid entry",
    ]);
    await c.query(
      "INSERT INTO ledger_postings(organization_id,journal_id,line,account,cents)VALUES($1,$2,0,$3,100)",
      [orgs[0], id, "cash"],
    );
    await expect(c.query("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toThrow(
      /balanced/,
    );
    await c.query("ROLLBACK");
  } finally {
    c.release();
  }
});

it("an employee without a linked worker cannot see or complete unassigned tasks", async () => {
  const user = (await get("employee", "/session")).body.userId;
  await admin.query(
    "UPDATE memberships SET worker_id=$3 WHERE organization_id=$1 AND user_id=$2",
    [orgs[0], user, ""],
  );
  try {
    expect(
      (await get("employee", "/organizations/" + orgs[0] + "/records/tasks"))
        .body.records,
    ).toHaveLength(0);
    const state = await get("owner", "/organizations/" + orgs[0] + "/state");
    expect(
      (
        await command("employee", {
          id: randomUUID(),
          kind: "complete-task",
          expectedRevision: state.body.revision,
          taskId: otherTaskId,
          minutes: 0,
          notes: "",
        })
      ).status,
    ).toBe(403);
  } finally {
    await admin.query(
      "UPDATE memberships SET worker_id=$3 WHERE organization_id=$1 AND user_id=$2",
      [orgs[0], user, requireFarm(first).workers[0].id],
    );
  }
});

it("the documented first-owner CLI creates a hashed local login from stdin without a default password", async () => {
  const name = "cli-" + randomUUID(),
    password = randomBytes(24).toString("hex") + " ";
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/create-user.ts", name, "Fictional CLI farm"],
    { input: password, encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain(password);
  const created = (
    await admin.query(
      "SELECT u.id,m.organization_id,u.password_hash FROM app_users u JOIN memberships m ON m.user_id=u.id WHERE u.username=$1",
      [name],
    )
  ).rows[0];
  userIds.push(created.id);
  orgs.push(created.organization_id);
  expect(created.password_hash).not.toBe(password);
  expect(created.password_hash.startsWith("scrypt$")).toBe(true);
  const login = await request(app)
    .post("/login")
    .send({ username: name, password });
  expect(login.status).toBe(200);
  expect(login.headers["set-cookie"][0]).toContain("HttpOnly");
  expect(login.headers["set-cookie"][0]).toContain("SameSite=Strict");
});
