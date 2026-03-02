CREATE TABLE "enterprise_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enterprise_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "enterprise_credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"job_id" uuid,
	"amount" integer NOT NULL,
	"action_type" text NOT NULL,
	"description" text,
	"balance_after" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"contact_email" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"credit_balance" integer DEFAULT 0 NOT NULL,
	"credits_per_request" integer DEFAULT 2 NOT NULL,
	"rpm_limit" integer DEFAULT 60 NOT NULL,
	"allowed_models" text[] DEFAULT ARRAY['gemini-2.5-flash-image']::text[] NOT NULL,
	"default_model" text DEFAULT 'gemini-2.5-flash-image' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enterprise_customers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "enterprise_processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"item_name" text NOT NULL,
	"model_used" text NOT NULL,
	"result_image_path" text,
	"result_signed_url" text,
	"result_url_expires_at" timestamp with time zone,
	"error_message" text,
	"credits_deducted" integer,
	"metadata" jsonb,
	"processing_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT NOW() + INTERVAL '7 days' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_rpm_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_rpm_window" UNIQUE("api_key_id","window_start")
);
--> statement-breakpoint
ALTER TABLE "enterprise_api_keys" ADD CONSTRAINT "enterprise_api_keys_customer_id_enterprise_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."enterprise_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_credit_transactions" ADD CONSTRAINT "enterprise_credit_transactions_customer_id_enterprise_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."enterprise_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_credit_transactions" ADD CONSTRAINT "enterprise_credit_transactions_job_id_enterprise_processing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."enterprise_processing_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_processing_jobs" ADD CONSTRAINT "enterprise_processing_jobs_customer_id_enterprise_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."enterprise_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_processing_jobs" ADD CONSTRAINT "enterprise_processing_jobs_api_key_id_enterprise_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."enterprise_api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_rpm_counters" ADD CONSTRAINT "enterprise_rpm_counters_api_key_id_enterprise_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."enterprise_api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_enterprise_api_keys_hash" ON "enterprise_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_enterprise_api_keys_customer" ON "enterprise_api_keys" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_ent_transactions_customer" ON "enterprise_credit_transactions" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_customer" ON "enterprise_processing_jobs" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_expires" ON "enterprise_processing_jobs" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_rpm_counters_window" ON "enterprise_rpm_counters" USING btree ("api_key_id","window_start");