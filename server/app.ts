import { canonical } from "../src/farmos/canonical.ts";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { Pool, PoolClient } from "pg";
import { digest, token, verifyPassword, hashPassword } from "./auth.ts";
import { readState, writeState, writeTaskChanges } from "./repository.ts";
import { validate, type Data } from "../src/model.ts";
import { upgrade, requireFarm, completeTask } from "../src/farmos/domain.ts";
import { ops, enterpriseReport } from "../src/farmos/operations.ts";
import { createHash } from "node:crypto";
type User = { id: string; csrfHash: string };
type Membership = {
  role: "owner" | "manager" | "employee" | "accountant" | "readonly";
  worker_id: string;
  scopes: string[];
};
export function createApp(
  pool: Pool,
  { origin = "http://127.0.0.1:5173", secureCookies = false } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (req.headers.origin && req.headers.origin !== origin)
      return res.status(403).json({ error: "Origin not allowed." });
    if (req.headers.origin === origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "20mb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  const loginLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  const users = new WeakMap<Request, User>();
  app.get("/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true, mode: "local-pilot" });
  });
  app.post("/login", loginLimit, async (req, res) => {
    const { username, password } = req.body ?? {};
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      password.length > 1024
    )
      return res.status(400).json({ error: "Invalid login." });
    const row = (
      await pool.query(
        "SELECT id,password_hash,disabled FROM app_users WHERE username=$1",
        [username],
      )
    ).rows[0];
    const fallback =
      "scrypt$00000000000000000000000000000000$" + "00".repeat(64);
    const valid = await verifyPassword(
      password,
      row?.password_hash ?? fallback,
    );
    if (!row || row.disabled || !valid)
      return res.status(401).json({ error: "Invalid username or password." });
    const session = token(),
      csrf = token();
    await pool.query(
      "INSERT INTO auth_sessions(token_hash,user_id,csrf_hash,expires_at)VALUES($1,$2,$3,now()+interval'8 hours')",
      [digest(session), row.id, digest(csrf)],
    );
    res.cookie("waterturn_session", session, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600000,
    });
    res.json({ csrfToken: csrf });
  });
  app.use(async (req, res, next) => {
    const match = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("waterturn_session="));
    const value = match?.slice("waterturn_session=".length);
    if (!value || value.length > 100)
      return res.status(401).json({ error: "Authentication required." });
    const row = (
      await pool.query(
        "SELECT s.user_id,s.csrf_hash FROM auth_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled",
        [digest(value)],
      )
    ).rows[0];
    if (!row)
      return res.status(401).json({ error: "Session expired or revoked." });
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (typeof req.headers["x-csrf-token"] !== "string" ||
        digest(req.headers["x-csrf-token"]) !== row.csrf_hash)
    )
      return res.status(403).json({ error: "CSRF verification failed." });
    users.set(req, { id: row.user_id, csrfHash: row.csrf_hash });
    next();
  });
  app.get("/session", async (req, res) => {
    const u = users.get(req)!;
    const memberships = await pool.query(
      "SELECT m.organization_id,m.role,m.worker_id,m.scopes,o.name FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.active",
      [u.id],
    );
    res.json({ userId: u.id, memberships: memberships.rows });
  });
  app.post("/logout", async (req, res) => {
    const raw = req.headers
      .cookie!.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("waterturn_session="))!
      .slice(18);
    await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [
      digest(raw),
    ]);
    res.clearCookie("waterturn_session", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookies,
    });
    res.json({ ok: true });
  });
  async function tenant<T>(
    req: Request,
    fn: (c: PoolClient, m: Membership) => Promise<T>,
  ) {
    const organizationId = String(req.params.org),
      user = users.get(req)!;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const membership = (
        await c.query(
          "SELECT role,worker_id,scopes FROM memberships WHERE organization_id=$1 AND user_id=$2 AND active FOR SHARE",
          [organizationId, user.id],
        )
      ).rows[0] as Membership | undefined;
      if (!membership)
        throw Object.assign(Error("Organization access denied."), {
          status: 403,
        });
      await c.query(
        "SELECT set_config('app.organization_id',$1,true),set_config('app.role',$2,true)",
        [organizationId, membership.role],
      );
      const result = await fn(c, membership);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  const deny = () => {
    throw Object.assign(Error("Permission denied."), { status: 403 });
  };
  app.get("/organizations/:org/revision", async (req, res) => {
    res.json(
      await tenant(req, async (c) => ({
        revision: Number(
          (
            await c.query("SELECT revision FROM organizations WHERE id=$1", [
              req.params.org,
            ])
          ).rows[0].revision,
        ),
      })),
    );
  });
  app.get("/organizations/:org/state", async (req, res) => {
    res.json(
      await tenant(req, async (c, m) => {
        if (m.role !== "owner") deny();
        return readState(c, String(req.params.org));
      }),
    );
  });
  app.get("/organizations/:org/records/:kind", async (req, res) => {
    res.json(
      await tenant(req, async (c, m) => {
        const kind = String(req.params.kind);
        const owner = m.role === "owner";
        const operations = [
          "fields",
          "sets",
          "sources",
          "sessions",
          "properties",
          "workers",
          "tasks",
          "assets",
          "items",
          "seasons",
          "groups",
          "animals",
          "weights",
          "health",
          "maintenance",
          "work",
        ];
        const accounting = ["enterprises", "journals", "sales", "scenarios"];
        const readonly = ["fields", "sources", "sets", "seasons", "items"];
        if (
          !owner &&
          !(m.role === "manager" && operations.includes(kind)) &&
          !(
            (m.role === "accountant" ||
              (m.role === "manager" && m.scopes.includes("finance:read"))) &&
            accounting.includes(kind)
          ) &&
          !(m.role === "readonly" && readonly.includes(kind)) &&
          !(
            m.role === "employee" &&
            ["tasks", "fields", "assets"].includes(kind)
          )
        )
          deny();
        const result = await c.query(
          "SELECT payload FROM records WHERE organization_id=$1 AND kind=$2 ORDER BY id",
          [req.params.org, kind],
        );
        let records = result.rows.map((r) => r.payload);
        if (m.role === "employee" && !m.worker_id) return { records: [] };
        if (m.role === "employee") {
          const tasks = (
            await c.query(
              "SELECT payload FROM records WHERE organization_id=$1 AND kind='tasks' AND payload->>'workerId'=$2",
              [req.params.org, m.worker_id],
            )
          ).rows.map((r) => r.payload);
          records =
            kind === "tasks"
              ? tasks
              : records.filter((r) =>
                  tasks.some(
                    (t) => (kind === "fields" ? t.fieldId : t.assetId) === r.id,
                  ),
                );
        }
        const hidden = new Set([
          "purchaseCents",
          "acquisitionCents",
          "costCents",
          "valueCents",
          "budgetCents",
          "postings",
          "rate",
          "rateCents",
          "documents",
          "priceCents",
          "depositCents",
          "processingCents",
        ]);
        if (
          ["employee", "readonly"].includes(m.role) ||
          (m.role === "manager" && !m.scopes.includes("finance:read"))
        )
          records = records.map((r) =>
            Object.fromEntries(
              Object.entries(r).filter(([key]) => !hidden.has(key)),
            ),
          );
        return { records };
      }),
    );
  });
  app.get("/organizations/:org/reports/financial", async (req, res) => {
    res.json(
      await tenant(req, async (c, m) => {
        if (
          !["owner", "accountant"].includes(m.role) &&
          !(m.role === "manager" && m.scopes.includes("finance:read"))
        )
          deny();
        const state = await readState(c, String(req.params.org));
        return {
          reports: ops(requireFarm(state.data)).enterprises.map((e) => ({
            enterprise: e.name,
            ...enterpriseReport(requireFarm(state.data), e.id),
          })),
        };
      }),
    );
  });
  app.get("/organizations/:org/members", async (req, res) => {
    res.json(
      await tenant(req, async (c, m) => {
        if (m.role !== "owner") deny();
        return {
          members: (
            await c.query(
              "SELECT m.user_id,u.username,m.role,m.worker_id,m.active,m.scopes FROM memberships m JOIN app_users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.username",
              [req.params.org],
            )
          ).rows,
        };
      }),
    );
  });
  app.post("/organizations/:org/members", async (req, res) => {
    res.json(
      await tenant(req, async (c, m) => {
        if (m.role !== "owner") deny();
        await c.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          req.params.org,
        ]);
        const b = req.body,
          roles = ["owner", "manager", "employee", "accountant", "readonly"];
        if (
          !b ||
          !roles.includes(b.role) ||
          typeof b.workerId !== "string" ||
          !Array.isArray(b.scopes) ||
          b.scopes.some((s: unknown) => s !== "finance:read")
        )
          throw Object.assign(Error("Invalid membership."), { status: 400 });
        if (
          b.workerId &&
          !(
            await c.query(
              "SELECT 1 FROM records WHERE organization_id=$1 AND kind='workers' AND id=$2",
              [req.params.org, b.workerId],
            )
          ).rowCount
        )
          throw Object.assign(
            Error("Worker must belong to this organization."),
            { status: 400 },
          );
        let userId = b.userId;
        if (b.action === "create") {
          if (
            typeof b.username !== "string" ||
            !/^[A-Za-z0-9_.-]{3,80}$/.test(b.username) ||
            typeof b.password !== "string"
          )
            throw Object.assign(
              Error("Use a 3–80 character username and a strong password."),
              { status: 400 },
            );
          const hash = await hashPassword(b.password);
          userId = crypto.randomUUID();
          await c.query(
            "INSERT INTO app_users(id,username,password_hash)VALUES($1,$2,$3)",
            [userId, b.username, hash],
          );
          await c.query(
            "INSERT INTO memberships(organization_id,user_id,role,worker_id,scopes)VALUES($1,$2,$3,$4,$5)",
            [req.params.org, userId, b.role, b.workerId, b.scopes],
          );
        } else if (b.action === "update") {
          if (typeof userId !== "string" || typeof b.active !== "boolean")
            throw Object.assign(Error("Invalid membership update."), {
              status: 400,
            });
          const existing = (
            await c.query(
              "SELECT role,active FROM memberships WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",
              [req.params.org, userId],
            )
          ).rows[0];
          if (!existing) deny();
          if (
            existing.role === "owner" &&
            existing.active &&
            (!b.active || b.role !== "owner")
          ) {
            const count = Number(
              (
                await c.query(
                  "SELECT count(*) FROM memberships WHERE organization_id=$1 AND role='owner' AND active",
                  [req.params.org],
                )
              ).rows[0].count,
            );
            if (count <= 1)
              throw Object.assign(
                Error("The last active owner cannot be removed or demoted."),
                { status: 400 },
              );
          }
          await c.query(
            "UPDATE memberships SET role=$3,worker_id=$4,active=$5,scopes=$6 WHERE organization_id=$1 AND user_id=$2",
            [req.params.org, userId, b.role, b.workerId, b.active, b.scopes],
          );
        } else
          throw Object.assign(Error("Unsupported membership action."), {
            status: 400,
          });
        const revision = Number(
          (
            await c.query(
              "UPDATE organizations SET revision=revision+1 WHERE id=$1 RETURNING revision",
              [req.params.org],
            )
          ).rows[0].revision,
        );
        await c.query(
          "INSERT INTO audit_events(organization_id,user_id,action,command_id,revision)VALUES($1,$2,$3,$4,$5)",
          [
            req.params.org,
            users.get(req)!.id,
            "membership." + b.action,
            crypto.randomUUID(),
            revision,
          ],
        );
        return { userId, revision };
      }),
    );
  });
  app.get("/organizations/:org/audit", async (req, res) => {
    res.json(
      await tenant(req, async (c, m) => {
        if (m.role !== "owner") deny();
        return {
          events: (
            await c.query(
              "SELECT action,command_id,revision,at FROM audit_events WHERE organization_id=$1 ORDER BY id DESC LIMIT 200",
              [req.params.org],
            )
          ).rows,
        };
      }),
    );
  });
  app.post("/organizations/:org/commands", async (req, res) => {
    res.json(
      await tenant(req, async (c, m) => {
        const body = req.body;
        if (
          !body ||
          typeof body.id !== "string" ||
          body.id.length < 8 ||
          body.id.length > 100 ||
          !Number.isSafeInteger(body.expectedRevision)
        )
          throw Object.assign(Error("Invalid command envelope."), {
            status: 400,
          });
        const org = String(req.params.org),
          actor = users.get(req)!.id;
        await c.query(
          "SELECT set_config('app.actor_id',$1,true),set_config('app.command_id',$2,true)",
          [actor, body.id],
        );
        const requestHash = createHash("sha256")
          .update(JSON.stringify(body))
          .digest("hex");
        await c.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          org,
        ]);
        const receipt = (
          await c.query(
            "SELECT user_id,request_hash,result FROM command_receipts WHERE organization_id=$1 AND id=$2",
            [org, body.id],
          )
        ).rows[0];
        if (receipt) {
          if (receipt.user_id !== actor || receipt.request_hash !== requestHash)
            throw Object.assign(
              Error("Command ID already used for a different request."),
              { status: 409 },
            );
          return receipt.result;
        }
        const current = await readState(c, org);
        if (body.expectedRevision !== current.revision)
          throw Object.assign(
            Error(
              "Conflict: server records changed. Pull and reconcile before retrying.",
            ),
            { status: 409 },
          );
        let next: Data;
        if (body.kind === "replace-state") {
          if (m.role !== "owner") deny();
          validate(body.data);
          next = upgrade(body.data);
          if (requireFarm(next).organization.id !== org)
            throw Object.assign(Error("Cross-organization import denied."), {
              status: 403,
            });
        } else if (body.kind === "complete-task") {
          if (!["owner", "manager", "employee"].includes(m.role)) deny();
          next = structuredClone(current.data);
          const task = requireFarm(next).tasks.find(
            (t) => t.id === body.taskId,
          );
          if (
            !task ||
            (m.role === "employee" &&
              (!m.worker_id || task.workerId !== m.worker_id))
          )
            deny();
          completeTask(
            next,
            body.taskId,
            body.minutes,
            String(body.notes ?? ""),
            body.id,
          );
          validate(next);
        } else
          throw Object.assign(Error("Unsupported command."), { status: 400 });
        // Clients may not rewrite posted financial history, stock movements or audit/activity records.
        if (body.kind === "replace-state") {
          const prev = requireFarm(current.data),
            after = requireFarm(next);
          for (const key of ["journals", "movements"] as const)
            for (const old of ops(prev)[key])
              if (
                !ops(after)[key].some(
                  (r) => r.id === old.id && canonical(r) === canonical(old),
                )
              )
                throw Object.assign(
                  Error(
                    "Posted ledger history is immutable; use corrective transactions.",
                  ),
                  { status: 409 },
                );
          for (const old of prev.activities)
            if (
              !after.activities.some(
                (a) => a.id === old.id && canonical(a) === canonical(old),
              )
            )
              throw Object.assign(
                Error("Activity history cannot be rewritten."),
                { status: 409 },
              );
        }
        const revision =
          body.kind === "complete-task"
            ? await writeTaskChanges(c, current.data, next, org)
            : await writeState(c, next, org);
        const result = { revision, commandId: body.id };
        await c.query(
          "INSERT INTO command_receipts(organization_id,id,user_id,request_hash,result)VALUES($1,$2,$3,$4,$5)",
          [org, body.id, actor, requestHash, JSON.stringify(result)],
        );
        await c.query(
          "INSERT INTO audit_events(organization_id,user_id,action,command_id,revision)VALUES($1,$2,$3,$4,$5)",
          [org, actor, body.kind, body.id, revision],
        );
        return result;
      }),
    );
  });
  app.use(
    (
      err: Error & { status?: number; type?: string; code?: string },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const status =
        err.status ??
        (err.type === "entity.too.large" ? 413 : err.code ? 500 : 400);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: status === 500 ? "Internal server error." : err.message,
      });
    },
  );
  return app;
}
