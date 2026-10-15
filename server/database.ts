import { Pool } from "pg";
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
export function database(admin = false) {
  if (admin && existsSync(".local/admin.env"))
    process.loadEnvFile(".local/admin.env");
  const connectionString = admin
    ? process.env.MIGRATION_DATABASE_URL
    : process.env.DATABASE_URL;
  if (!connectionString)
    throw Error(
      "Database configuration missing. Run npm run backend:setup for a local-only pilot.",
    );
  return new Pool({ connectionString, max: 10 });
}
export async function migrate() {
  const pool = database(true);
  try {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const file of readdirSync("db/migrations")
        .filter((f) => /^\d+_.*\.sql$/.test(f))
        .sort()) {
        const version = Number(file.split("_")[0]);
        const exists = (
          await c.query("SELECT 1 FROM schema_migrations WHERE version=$1", [
            version,
          ])
        ).rowCount;
        if (!exists) {
          await c.query(readFileSync("db/migrations/" + file, "utf8"));
          await c.query(
            "INSERT INTO schema_migrations(version)VALUES($1)ON CONFLICT DO NOTHING",
            [version],
          );
        }
      }
      const password = process.env.FARMOS_DB_APP_PASSWORD;
      if (!password || !/^[a-f0-9]{64}$/.test(password))
        throw Error("Local app database password missing.");
      const exists = (
        await c.query("SELECT 1 FROM pg_roles WHERE rolname='farmos_app'")
      ).rowCount;
      if (!exists)
        await c.query(
          "CREATE ROLE farmos_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '" +
            password +
            "'",
        );
      await c.query("GRANT CONNECT ON DATABASE farmos TO farmos_app");
      await c.query("GRANT USAGE ON SCHEMA public TO farmos_app");
      await c.query(
        "GRANT SELECT,INSERT,UPDATE,DELETE ON app_users,organizations,memberships,auth_sessions,records,record_links,command_receipts TO farmos_app",
      );
      await c.query(
        "REVOKE UPDATE,DELETE ON ledger_journals,ledger_postings FROM farmos_app",
      );
      await c.query(
        "GRANT SELECT,INSERT ON audit_events,record_audit,ledger_journals,ledger_postings TO farmos_app",
      );
      await c.query(
        "GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO farmos_app",
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  } finally {
    await pool.end();
  }
}
