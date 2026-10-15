import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hashPassword } from "../server/auth.ts";
import { database } from "../server/database.ts";
import { empty } from "../src/model.ts";
import { upgrade, requireFarm } from "../src/farmos/domain.ts";
import { writeState } from "../server/repository.ts";
// Password is read from stdin; never pass it as a command argument or print it.
const username = process.argv[2];
const organizationName = process.argv[3];
if (!username || !organizationName)
  throw Error(
    'Usage: npm run backend:user -- username "Fictional farm" < secure-password-file',
  );
const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
const hash = await hashPassword(password);
const pool = database();
const c = await pool.connect();
try {
  await c.query("BEGIN");
  const userId = randomUUID();
  await c.query(
    "INSERT INTO app_users(id,username,password_hash)VALUES($1,$2,$3)",
    [userId, username, hash],
  );
  const d = upgrade(empty());
  const f = requireFarm(d);
  f.organization.name = organizationName;
  d.settings.farmName = organizationName;
  await c.query("INSERT INTO organizations(id,name)VALUES($1,$2)", [
    f.organization.id,
    organizationName,
  ]);
  await c.query(
    "INSERT INTO memberships(organization_id,user_id,role)VALUES($1,$2,$3)",
    [f.organization.id, userId, "owner"],
  );
  await c.query(
    "SELECT set_config('app.organization_id',$1,true),set_config('app.role','owner',true)",
    [f.organization.id],
  );
  await writeState(c, d, f.organization.id);
  await c.query("COMMIT");
  console.log(
    "Local owner and empty organization created. Sign in to the API to select this organization.",
  );
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
