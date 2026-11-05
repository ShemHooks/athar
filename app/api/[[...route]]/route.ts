import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedIfEmpty } from "@/lib/seed";
import { patients, events, findings, decisions, settings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { extractFollowUp } from "@/lib/analyze";
import { z } from "zod";
import { users, sessions, clarifications } from "@/lib/schema";
import {
  currentUser,
  can,
  checkPassword,
  hashPassword,
  createSession,
  roles,
} from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });
const error = (message: string, status = 400) =>
  response({ error: message }, status);
const actionSchema = z.object({
  status: z.enum([
    "new",
    "under_review",
    "confirmed",
    "in_progress",
    "awaiting_service",
    "closed",
    "incorrect",
    "indeterminate",
  ]),
  assignee: z.string().min(1).max(80),
  note: z.string().max(1500).default(""),
  closureReason: z.string().max(300).optional(),
  closureEvidence: z.string().max(500).optional(),
  reviewer: z.string().max(80).optional(),
});
function getParts(req: NextRequest) {
  return new URL(req.url).pathname
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean);
}
export async function GET(req: NextRequest) {
  try {
    await seedIfEmpty();
    const [resource, id] = getParts(req);
    const user = await currentUser(req);
    if (resource === "me")
      return user ? response(user) : error("Not signed in", 401);
    if (!user) return error("Authentication required", 401);
    if (resource === "health")
      return response({
        ok: true,
        mode: "synthetic",
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      });
    if (resource === "users") {
      if (!can(user.role, "manage_users")) return error("Forbidden", 403);
      return response(
        (await db.select().from(users)).map(({ passwordHash, ...u }) => u),
      );
    }
    if (resource === "clarifications") {
      if (!can(user.role, "view_clinical")) return error("Forbidden", 403);
      return response(await db.select().from(clarifications));
    }
    if (resource === "settings")
      return response(await db.select().from(settings));
    if (resource === "decisions") {
      if (!can(user.role, "view_clinical")) return error("Forbidden", 403);
      return response(
        (await db.select().from(decisions)).filter(
          (d) => !id || d.findingId === id,
        ),
      );
    }
    if (["patients", "events", "findings"].includes(resource)) {
      if (!can(user.role, "view_clinical")) return error("Forbidden", 403);
      const allPatients = await db.select().from(patients);
      const allowed = new Set(
        allPatients
          .filter((p) => user.role !== "nurse" || p.assignedNurse === user.name)
          .map((p) => p.id),
      );
      if (resource === "patients")
        return response(allPatients.filter((p) => allowed.has(p.id)));
      if (resource === "events")
        return response(
          (await db.select().from(events)).filter(
            (e) => allowed.has(e.patientId) && (!id || e.patientId === id),
          ),
        );
      return response(
        (await db.select().from(findings)).filter((f) =>
          allowed.has(f.patientId),
        ),
      );
    }
    return error("Unknown endpoint", 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Server error", 500);
  }
}
export async function POST(req: NextRequest) {
  try {
    await seedIfEmpty();
    const [resource] = getParts(req);
    const input = await req.json();
    if (resource === "login") {
      const parsed = z
        .object({ email: z.email(), password: z.string() })
        .safeParse(input);
      if (!parsed.success) return error("Invalid credentials", 401);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, parsed.data.email.toLowerCase()))
        .limit(1);
      if (
        !user ||
        !user.active ||
        !checkPassword(parsed.data.password, user.passwordHash)
      )
        return error("Invalid credentials", 401);
      const res = response({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
      const { sessionId, expiresAt } = await createSession(user.id);

      res.cookies.set("athar_session", sessionId, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: expiresAt,
      });
      return res;
    }
    const user = await currentUser(req);
    if (!user) return error("Authentication required", 401);
    if (resource === "logout") {
      const token = req.cookies.get("athar_session")?.value;
      if (token) await db.delete(sessions).where(eq(sessions.id, token));
      const res = response({ ok: true });
      res.cookies.delete("athar_session");
      return res;
    }
    if (resource === "users") {
      if (!can(user.role, "manage_users")) return error("Forbidden", 403);
      const parsed = z
        .object({
          name: z.string().min(2).max(80),
          email: z.email(),
          password: z.string().min(10).max(100),
          role: z.enum(roles),
        })
        .safeParse(input);
      if (!parsed.success)
        return error(
          "Invalid user data: password must be at least 10 characters",
        );
      const id = crypto.randomUUID();
      await db.insert(users).values({
        id,
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        passwordHash: hashPassword(parsed.data.password),
        active: 1,
      });
      return response({ id }, 201);
    }
    if (resource === "clarifications") {
      if (!can(user.role, "clarify")) return error("Forbidden", 403);
      const parsed = z
        .object({
          findingId: z.string(),
          response: z.string().min(5).max(2000),
        })
        .safeParse(input);
      if (!parsed.success) return error("Invalid clarification");
      const [finding] = await db
        .select()
        .from(findings)
        .where(eq(findings.id, parsed.data.findingId))
        .limit(1);
      if (!finding) return error("Finding not found", 404);
      await db.insert(clarifications).values({
        id: crypto.randomUUID(),
        findingId: finding.id,
        physicianId: user.id,
        response: parsed.data.response,
        createdAt: new Date().toISOString(),
      });
      return response({ ok: true }, 201);
    }
    if (resource === "analyze") {
      if (!can(user.role, "analyze")) return error("Forbidden", 403);
      const parsed = z
        .object({ note: z.string().min(8).max(5000) })
        .safeParse(input);
      if (!parsed.success) return error("Provide a note of 8–5000 characters");
      return response(await extractFollowUp(parsed.data.note));
    }
    if (resource === "events") {
      if (!can(user.role, "add_event")) return error("Forbidden", 403);
      const parsed = z
        .object({
          patientId: z.string(),
          kind: z.enum([
            "plan",
            "referral",
            "booking",
            "visit",
            "cancellation",
          ]),
          title: z.string().min(1).max(160),
          body: z.string().min(1).max(2000),
          eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          status: z.string().max(50),
        })
        .safeParse(input);
      if (!parsed.success) return error("Invalid event");
      const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, parsed.data.patientId))
        .limit(1);
      if (
        !patient ||
        (user.role === "nurse" && patient.assignedNurse !== user.name)
      )
        return error("Patient not found", 404);
      const id = crypto.randomUUID();
      await db.insert(events).values({
        ...parsed.data,
        id,
        titleAr: parsed.data.title,
        bodyAr: parsed.data.body,
        sourceId: `SIM-${id.slice(0, 8)}`,
      });
      return response({ id }, 201);
    }
    return error("Unknown endpoint", 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Server error", 500);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    await seedIfEmpty();
    const user = await currentUser(req);
    if (!user) return error("Authentication required", 401);
    const [resource, id] = getParts(req);
    if (resource === "users" && id) {
      if (!can(user.role, "manage_users")) return error("Forbidden", 403);
      const parsed = z
        .object({ active: z.boolean() })
        .safeParse(await req.json());
      if (!parsed.success) return error("Invalid status");
      if (user.id === id && !parsed.data.active)
        return error("Cannot disable your own account");
      await db
        .update(users)
        .set({ active: parsed.data.active ? 1 : 0 })
        .where(eq(users.id, id));
      return response({ ok: true });
    }
    if (resource !== "findings" || !id) return error("Unknown endpoint", 404);
    if (!can(user.role, "review")) return error("Forbidden", 403);
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) return error("Invalid finding update");
    const [previous] = await db
      .select()
      .from(findings)
      .where(eq(findings.id, id))
      .limit(1);
    if (!previous) return error("Finding not found", 404);
    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, previous.patientId))
      .limit(1);
    if (user.role === "nurse" && patient?.assignedNurse !== user.name)
      return error("Forbidden", 403);
    const data = parsed.data;
    if (user.role === "nurse" && data.assignee !== previous.assignee)
      return error("Only supervisors can reassign cases", 403);
    if (
      data.status === "closed" &&
      (!data.closureReason?.trim() || !data.closureEvidence?.trim())
    )
      return error("Closure requires reason and evidence");
    await db
      .update(findings)
      .set({
        status: data.status,
        assignee: data.assignee,
        closureReason: data.status === "closed" ? data.closureReason : null,
        closureEvidence: data.status === "closed" ? data.closureEvidence : null,
        reviewer: data.status === "closed" ? user.name : null,
        lastUpdated: new Date().toISOString().slice(0, 10),
      })
      .where(eq(findings.id, id));
    await db.insert(decisions).values({
      id: crypto.randomUUID(),
      findingId: id,
      actor: user.name,
      action: `${previous.status} → ${data.status}`,
      note: data.note || data.closureReason || "Status updated",
      createdAt: new Date().toISOString(),
    });
    return response({ ok: true });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Server error", 500);
  }
}
