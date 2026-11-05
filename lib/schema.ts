import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
export const patients = pgTable("patients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  age: integer("age").notNull(),
  clinic: text("clinic").notNull(),
  assignedNurse: text("assigned_nurse").notNull(),
});
export const events = pgTable("events", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  titleAr: text("title_ar").notNull(),
  body: text("body").notNull(),
  bodyAr: text("body_ar").notNull(),
  eventDate: text("event_date").notNull(),
  status: text("status").notNull(),
  sourceId: text("source_id").notNull(),
});
export const findings = pgTable("findings", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  action: text("action").notNull(),
  actionAr: text("action_ar").notNull(),
  dueDate: text("due_date"),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  assignee: text("assignee").notNull(),
  reason: text("reason").notNull(),
  sourceEventId: text("source_event_id").notNull(),
  coverage: text("coverage").notNull(),
  lastUpdated: text("last_updated").notNull(),
  closureReason: text("closure_reason"),
  closureEvidence: text("closure_evidence"),
  reviewer: text("reviewer"),
});
export const decisions = pgTable("decisions", {
  id: text("id").primaryKey(),
  findingId: text("finding_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  note: text("note").notNull(),
  createdAt: text("created_at").notNull(),
});
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  active: integer("active").notNull().default(1),
});
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),

  userId: text("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }).notNull(),
});
export const clarifications = pgTable("clarifications", {
  id: text("id").primaryKey(),
  findingId: text("finding_id").notNull(),
  physicianId: text("physician_id").notNull(),
  response: text("response").notNull(),
  createdAt: text("created_at").notNull(),
});
