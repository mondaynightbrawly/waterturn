import { createApp } from "./app.ts";
import { database } from "./database.ts";
const pool = database();
const identity = (
  await pool.query(
    "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
  )
).rows[0];
if (identity.rolsuper || identity.rolbypassrls)
  throw Error("API must use a non-superuser database role without RLS bypass.");
const port = Number(process.env.FARMOS_API_PORT ?? 8787);
const app = createApp(pool, {
  origin: process.env.FARMOS_WEB_ORIGIN ?? "http://127.0.0.1:5173",
  secureCookies: process.env.FARMOS_SECURE_COOKIES === "true",
});
const server = app.listen(port, "127.0.0.1", () =>
  console.log("WaterTurn local API ready on loopback port " + port),
);
process.on("SIGTERM", () =>
  server.close(() => {
    pool.end().then(() => process.exit(0));
  }),
);
