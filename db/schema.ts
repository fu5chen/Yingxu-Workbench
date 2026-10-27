import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(), owner: text("owner").notNull(),
  kind: text("kind").notNull(), name: text("name").notNull(),
  mime: text("mime").notNull(), size: integer("size").notNull(),
  url: text("url").notNull(), expires: text("expires"),
  created: integer("created").notNull(),
  arkId: text("ark_id"), arkGroup: text("ark_group"), arkProject: text("ark_project"),
  arkStatus: text("ark_status"), arkError: text("ark_error"), arkUpdated: integer("ark_updated"),
}, t => [index("idx_assets_owner_created").on(t.owner, t.created)]);
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), owner: text("owner").notNull(),
  upstream: text("upstream"), status: text("status").notNull(),
  request: text("request").notNull(), result: text("result").notNull(),
  created: integer("created").notNull(), updated: integer("updated").notNull(),
  deletedAt: integer("deleted_at"),
  quotaSeconds: integer("quota_seconds").notNull().default(0),
}, t => [index("idx_jobs_owner_created").on(t.owner, t.created)]);
export const generationQueue = sqliteTable("generation_queue", {
  jobId: text("job_id").primaryKey(), owner: text("owner").notNull(),
  provider: text("provider").notNull(), sealedKey: text("sealed_key").notNull(),
  state: text("state").notNull().default("pending"),
  created: integer("created").notNull(), updated: integer("updated").notNull(),
  nextPoll: integer("next_poll").notNull().default(0),
}, t => [index("idx_generation_queue_state").on(t.state, t.created)]);
export const mediaCache = sqliteTable("media_cache", {
  jobId: text("job_id").primaryKey(), state: text("state").notNull(),
  created: integer("created").notNull(), updated: integer("updated").notNull(),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
});
