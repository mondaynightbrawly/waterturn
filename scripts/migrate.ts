import { migrate } from "../server/database.ts";
await migrate();
console.log("Database migration completed.");
