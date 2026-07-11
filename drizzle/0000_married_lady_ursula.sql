-- NOTE: "auth"."users" is managed by Supabase Auth and already exists;
-- drizzle-kit generated a CREATE TABLE for it here (it only knows the
-- shape we reference), but running that would fail/conflict. It has been
-- removed from this migration on purpose — do not re-add it.
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categories_color_hex_chk" CHECK ("categories"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "invited_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saved_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category_ids" uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sheet_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"slot" smallint NOT NULL,
	"category_id" uuid NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_user_id_day_slot_pk" PRIMARY KEY("user_id","day","slot"),
	CONSTRAINT "time_entries_slot_range_chk" CHECK ("time_entries"."slot" >= 0 AND "time_entries"."slot" <= 95)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"sheet_spreadsheet_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invited_emails" ADD CONSTRAINT "invited_emails_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_outbox" ADD CONSTRAINT "sheet_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_code_active_idx" ON "categories" USING btree ("user_id","code") WHERE "categories"."archived" = false;--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "saved_queries_user_id_idx" ON "saved_queries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sheet_outbox_pending_user_day_idx" ON "sheet_outbox" USING btree ("user_id","day") WHERE "sheet_outbox"."exported_at" is null;--> statement-breakpoint
CREATE INDEX "sheet_outbox_pending_idx" ON "sheet_outbox" USING btree ("exported_at") WHERE "sheet_outbox"."exported_at" is null;--> statement-breakpoint
CREATE INDEX "time_entries_user_day_idx" ON "time_entries" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "time_entries_category_id_idx" ON "time_entries" USING btree ("category_id");