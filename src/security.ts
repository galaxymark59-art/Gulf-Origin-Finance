import { readLocal, writeLocal } from "./storage";
import { native, SecureVault } from "./native";
type Lock = {
  salt: string;
  hash: string;
  failures: number;
  blockedUntil: number;
  biometric: boolean;
};
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
async function pinHash(pin: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: new TextEncoder().encode(salt),
          iterations: 310000,
          hash: "SHA-256",
        },
        key,
        256,
      ),
    ),
  );
}
export const getLock = (owner: string) => readLocal<Lock>("lock:" + owner);
export async function setPin(owner: string, pin: string, biometric: boolean) {
  if (!/^(\d{4}|\d{6})$/.test(pin)) throw Error("Use a four or six digit PIN.");
  const salt = hex(crypto.getRandomValues(new Uint8Array(32)));
  await writeLocal("lock:" + owner, {
    salt,
    hash: await pinHash(pin, salt),
    failures: 0,
    blockedUntil: 0,
    biometric: native && biometric,
  });
}
export async function unlockPin(owner: string, pin: string) {
  const lock = await getLock(owner);
  if (!lock) return;
  if (Date.now() < lock.blockedUntil)
    throw Error("Too many attempts. Try again after five minutes.");
  if ((await pinHash(pin, lock.salt)) !== lock.hash) {
    lock.failures++;
    if (lock.failures >= 5) {
      lock.blockedUntil = Date.now() + 300000;
      lock.failures = 0;
    }
    await writeLocal("lock:" + owner, lock);
    throw Error("Incorrect PIN.");
  }
  await writeLocal("lock:" + owner, { ...lock, failures: 0, blockedUntil: 0 });
}
export async function unlockBiometric(owner: string) {
  const lock = await getLock(owner);
  if (!native || !lock?.biometric) throw Error("Biometrics are not enabled.");
  await SecureVault.biometric();
}
