import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCb);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 1024)
    throw Error("Password must contain 12–1024 characters.");
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return "scrypt$" + salt + "$" + key.toString("hex");
}
export async function verifyPassword(password: string, hash: string) {
  const [algorithm, salt, key] = hash.split("$");
  if (algorithm !== "scrypt" || !salt || !key) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
