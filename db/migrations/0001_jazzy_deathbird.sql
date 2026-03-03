CREATE TABLE "enterprise_daily_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"date" date NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"total_credits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_daily_stats_customer_date" UNIQUE("customer_id","date")
);
--> statement-breakpoint
ALTER TABLE "enterprise_daily_stats" ADD CONSTRAINT "enterprise_daily_stats_customer_id_enterprise_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."enterprise_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_daily_stats_date" ON "enterprise_daily_stats" USING btree ("date");