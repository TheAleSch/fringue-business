import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── enterprise_customers ──────────────────────────────────────────────────

export const enterpriseCustomers = pgTable('enterprise_customers', {
  id:                uuid('id').primaryKey().defaultRandom(),
  name:              text('name').notNull(),
  slug:              text('slug').notNull().unique(),           // e.g. "acme-corp"
  contactEmail:      text('contact_email').notNull(),
  isActive:          boolean('is_active').notNull().default(true),

  // Credit pool
  creditBalance:     integer('credit_balance').notNull().default(0),
  creditsPerRequest: integer('credits_per_request').notNull().default(2),

  // Rate limiting
  rpmLimit:          integer('rpm_limit').notNull().default(60),

  // AI model configuration
  allowedModels:     text('allowed_models').array().notNull().default(
    sql`ARRAY['gemini-2.5-flash-image']::text[]`
  ),
  defaultModel:      text('default_model').notNull().default('gemini-2.5-flash-image'),

  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── enterprise_api_keys ──────────────────────────────────────────────────

export const enterpriseApiKeys = pgTable(
  'enterprise_api_keys',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull().references(() => enterpriseCustomers.id, { onDelete: 'cascade' }),
    name:       text('name').notNull(),                 // friendly label
    keyHash:    text('key_hash').notNull().unique(),    // SHA-256 hex — NEVER store plaintext
    keyPrefix:  text('key_prefix').notNull(),           // first 12 chars: "fre_live_a3f"
    isActive:   boolean('is_active').notNull().default(true),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt:  timestamp('expires_at', { withTimezone: true }),  // null = never
    createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_enterprise_api_keys_hash').on(t.keyHash),
    index('idx_enterprise_api_keys_customer').on(t.customerId),
  ]
);

// ─── enterprise_rpm_counters ──────────────────────────────────────────────

export const enterpriseRpmCounters = pgTable(
  'enterprise_rpm_counters',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    apiKeyId:     uuid('api_key_id').notNull().references(() => enterpriseApiKeys.id, { onDelete: 'cascade' }),
    windowStart:  timestamp('window_start', { withTimezone: true }).notNull(),
    requestCount: integer('request_count').notNull().default(1),
  },
  (t) => [
    unique('uq_rpm_window').on(t.apiKeyId, t.windowStart),
    index('idx_rpm_counters_window').on(t.apiKeyId, t.windowStart),
  ]
);

// ─── enterprise_processing_jobs ───────────────────────────────────────────

export const enterpriseProcessingJobs = pgTable(
  'enterprise_processing_jobs',
  {
    id:                    uuid('id').primaryKey().defaultRandom(),
    customerId:            uuid('customer_id').notNull().references(() => enterpriseCustomers.id),
    apiKeyId:              uuid('api_key_id').notNull().references(() => enterpriseApiKeys.id),

    status:                text('status').notNull().default('processing'),

    itemName:              text('item_name').notNull(),
    modelUsed:             text('model_used').notNull(),

    // Result (null until completed)
    resultImagePath:       text('result_image_path'),
    resultSignedUrl:       text('result_signed_url'),
    resultUrlExpiresAt:    timestamp('result_url_expires_at', { withTimezone: true }),

    errorMessage:          text('error_message'),
    creditsDeducted:       integer('credits_deducted'),

    // Performance metadata
    metadata:              jsonb('metadata'),

    processingStartedAt:   timestamp('processing_started_at', { withTimezone: true }).notNull().defaultNow(),
    processingCompletedAt: timestamp('processing_completed_at', { withTimezone: true }),

    // Jobs and R2 files deleted after 7 days
    expiresAt:             timestamp('expires_at', { withTimezone: true })
                             .notNull()
                             .default(sql`NOW() + INTERVAL '7 days'`),

    createdAt:             timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_jobs_customer').on(t.customerId, t.createdAt),
    index('idx_jobs_expires').on(t.expiresAt),
  ]
);

// ─── enterprise_credit_transactions ──────────────────────────────────────

export const enterpriseCreditTransactions = pgTable(
  'enterprise_credit_transactions',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    customerId:   uuid('customer_id').notNull().references(() => enterpriseCustomers.id),
    jobId:        uuid('job_id').references(() => enterpriseProcessingJobs.id),
    amount:       integer('amount').notNull(),
    actionType:   text('action_type').notNull(),
    description:  text('description'),
    balanceAfter: integer('balance_after').notNull(),
    metadata:     jsonb('metadata'),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ent_transactions_customer').on(t.customerId, t.createdAt),
  ]
);

// ─── enterprise_daily_stats ───────────────────────────────────────────────

export const enterpriseDailyStats = pgTable(
  'enterprise_daily_stats',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    customerId:   uuid('customer_id').notNull().references(() => enterpriseCustomers.id, { onDelete: 'cascade' }),
    date:         date('date').notNull(),
    successCount: integer('success_count').notNull().default(0),
    failedCount:  integer('failed_count').notNull().default(0),
    totalCredits: integer('total_credits').notNull().default(0),
  },
  (t) => [
    unique('uq_daily_stats_customer_date').on(t.customerId, t.date),
    index('idx_daily_stats_customer_date').on(t.customerId, t.date),
    index('idx_daily_stats_date').on(t.date),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────

export const enterpriseCustomersRelations = relations(enterpriseCustomers, ({ many }) => ({
  apiKeys: many(enterpriseApiKeys),
  processingJobs: many(enterpriseProcessingJobs),
  creditTransactions: many(enterpriseCreditTransactions),
  dailyStats: many(enterpriseDailyStats),
}));

export const enterpriseApiKeysRelations = relations(enterpriseApiKeys, ({ one, many }) => ({
  customer: one(enterpriseCustomers, {
    fields: [enterpriseApiKeys.customerId],
    references: [enterpriseCustomers.id],
  }),
  rpmCounters: many(enterpriseRpmCounters),
  processingJobs: many(enterpriseProcessingJobs),
}));

export const enterpriseRpmCountersRelations = relations(enterpriseRpmCounters, ({ one }) => ({
  apiKey: one(enterpriseApiKeys, {
    fields: [enterpriseRpmCounters.apiKeyId],
    references: [enterpriseApiKeys.id],
  }),
}));

export const enterpriseProcessingJobsRelations = relations(enterpriseProcessingJobs, ({ one }) => ({
  customer: one(enterpriseCustomers, {
    fields: [enterpriseProcessingJobs.customerId],
    references: [enterpriseCustomers.id],
  }),
  apiKey: one(enterpriseApiKeys, {
    fields: [enterpriseProcessingJobs.apiKeyId],
    references: [enterpriseApiKeys.id],
  }),
}));

export const enterpriseCreditTransactionsRelations = relations(enterpriseCreditTransactions, ({ one }) => ({
  customer: one(enterpriseCustomers, {
    fields: [enterpriseCreditTransactions.customerId],
    references: [enterpriseCustomers.id],
  }),
  job: one(enterpriseProcessingJobs, {
    fields: [enterpriseCreditTransactions.jobId],
    references: [enterpriseProcessingJobs.id],
  }),
}));

export const enterpriseDailyStatsRelations = relations(enterpriseDailyStats, ({ one }) => ({
  customer: one(enterpriseCustomers, {
    fields: [enterpriseDailyStats.customerId],
    references: [enterpriseCustomers.id],
  }),
}));

// ─── Type exports ─────────────────────────────────────────────────────────

export type EnterpriseCustomer = typeof enterpriseCustomers.$inferSelect;
export type NewEnterpriseCustomer = typeof enterpriseCustomers.$inferInsert;
export type EnterpriseApiKey = typeof enterpriseApiKeys.$inferSelect;
export type EnterpriseProcessingJob = typeof enterpriseProcessingJobs.$inferSelect;
export type EnterpriseCreditTransaction = typeof enterpriseCreditTransactions.$inferSelect;
export type EnterpriseDailyStat = typeof enterpriseDailyStats.$inferSelect;
export type NewEnterpriseDailyStat = typeof enterpriseDailyStats.$inferInsert;
