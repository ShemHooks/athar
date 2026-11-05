import "server-only";
import { randomUUID } from "node:crypto";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { users, sessions } from "./schema";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
export type Role = "admin" | "supervisor" | "nurse" | "physician";
export const roles: Role[] = ["admin", "supervisor", "nurse", "physician"];
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function checkPassword(password: string, stored: string) {
  try {
    const [salt, hash] = stored.split(":");
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
export async function createSession(userId: string) {
  const sessionId = randomUUID();

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return {
    sessionId,
    expiresAt,
  };
}
export async function currentUser(req: NextRequest) {
  const token = req.cookies.get("athar_session")?.value;
  if (!token) return null;
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, token))
    .limit(1);
  if (!session || session.expiresAt.getTime() < Date.now()) {
    return null;
  }
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user || !user.active) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
  };
}
export function can(
  role: Role,
  action:
    | "view_clinical"
    | "review"
    | "assign"
    | "clarify"
    | "manage_users"
    | "analytics"
    | "analyze"
    | "add_event",
) {
  return (
    {
      view_clinical: ["supervisor", "nurse", "physician"],
      review: ["supervisor", "nurse"],
      assign: ["supervisor"],
      clarify: ["physician"],
      manage_users: ["admin"],
      analytics: ["admin", "supervisor"],
      analyze: ["supervisor", "nurse"],
      add_event: ["supervisor", "nurse"],
    }[action] as string[]
  ).includes(role);
}
