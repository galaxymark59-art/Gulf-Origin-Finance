import { openDB } from "idb";
import { native } from "./native";
import { desktop } from "./desktop";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
let sql: SQLiteDBConnection | undefined;
let opening: Promise<SQLiteDBConnection> | undefined;
const browserDB = () =>
  openDB("gulf-origin-private", 1, {
    upgrade(db) {
      db.createObjectStore("records");
    },
  });
async function nativeDB() {
  if (sql) return sql;
  if (opening) return opening;
  opening = openNative();
  return opening;
}
async function openNative() {
  const { CapacitorSQLite, SQLiteConnection } = await import(
    "@capacitor-community/sqlite"
  );
  const connection = new SQLiteConnection(CapacitorSQLite);
  if (!(await connection.isSecretStored()).result)
    await connection.setEncryptionSecret(
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    );
  sql = await connection.createConnection(
    "gulforigin",
    true,
    "secret",
    1,
    false,
  );
  await sql.open();
  await sql.execute(
    "CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
  );
  return sql;
}
export async function readLocal<T>(key: string): Promise<T | null> {
  if (desktop) {
    const value = await desktop.get("local:" + key);
    return value === null ? null : JSON.parse(value);
  }
  if (native) {
    const db = await nativeDB();
    const r = await db.query("SELECT value FROM records WHERE key=?", [key]);
    return r.values?.length ? JSON.parse(r.values[0].value) : null;
  }
  const db = await browserDB();
  const encrypted = await db.get("records", key);
  if (!encrypted) return null;
  const secret = await db.get("records", "crypto:" + key);
  if (!secret) throw Error("LOCAL_KEY_MISSING");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: encrypted.iv },
    secret,
    encrypted.cipher,
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function writeLocal(key: string, value: unknown) {
  if (desktop) {
    await desktop.set("local:" + key, JSON.stringify(value));
    return;
  }
  if (native) {
    const db = await nativeDB();
    await db.run(
      "INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [key, JSON.stringify(value)],
    );
    return;
  }
  const db = await browserDB();
  let secret: CryptoKey = await db.get("records", "crypto:" + key);
  if (!secret) {
    secret = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await db.put("records", secret, "crypto:" + key);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    secret,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  await db.put("records", { iv, cipher }, key);
}
