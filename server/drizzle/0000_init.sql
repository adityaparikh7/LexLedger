CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text
);
--> statement-breakpoint
CREATE TABLE "firm_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"firm_name" text DEFAULT '' NOT NULL,
	"firm_address" text DEFAULT '' NOT NULL,
	"firm_phone" text DEFAULT '' NOT NULL,
	"firm_email" text DEFAULT '' NOT NULL,
	"bank_account_name" text DEFAULT '' NOT NULL,
	"bank_name" text DEFAULT '' NOT NULL,
	"bank_account_number" text DEFAULT '' NOT NULL,
	"bank_ifsc" text DEFAULT '' NOT NULL,
	"pan_number" text DEFAULT '' NOT NULL,
	"signature_name" text DEFAULT '' NOT NULL,
	"signature_full" text DEFAULT '' NOT NULL,
	"smtp_host" text DEFAULT '' NOT NULL,
	"smtp_port" integer DEFAULT 587 NOT NULL,
	"smtp_user" text DEFAULT '' NOT NULL,
	"smtp_pass" text DEFAULT '' NOT NULL,
	"email_client" text DEFAULT 'mailto' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"file_type" text NOT NULL,
	"file_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_sequences" (
	"account_id" uuid NOT NULL,
	"fy" text NOT NULL,
	"next_seq" integer NOT NULL,
	CONSTRAINT "invoice_sequences_account_id_fy_pk" PRIMARY KEY("account_id","fy")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"invoice_number" text,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"date_paid" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"case_name" text,
	"case_party1_type" text,
	"case_plaintiff" text,
	"case_party2_type" text,
	"case_defendant" text,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_rate" numeric(6, 3) DEFAULT 0 NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"amount_received" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tds_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" IN ('draft','sent','paid','unpaid','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"hours" numeric(10, 2) DEFAULT 0 NOT NULL,
	"rate" numeric(14, 2) DEFAULT 0 NOT NULL,
	"amount" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"invoice_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount_received" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tds_amount" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_profile" ADD CONSTRAINT "firm_profile_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_copies" ADD CONSTRAINT "invoice_copies_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_copies" ADD CONSTRAINT "invoice_copies_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_account_version_idx" ON "clients" USING btree ("account_id","version");--> statement-breakpoint
CREATE INDEX "clients_account_name_idx" ON "clients" USING btree ("account_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "firm_profile_account_idx" ON "firm_profile" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "firm_profile_account_version_idx" ON "firm_profile" USING btree ("account_id","version");--> statement-breakpoint
CREATE INDEX "invoice_copies_invoice_idx" ON "invoice_copies" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_account_number_idx" ON "invoices" USING btree ("account_id","invoice_number") WHERE "invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "invoices_account_version_idx" ON "invoices" USING btree ("account_id","version");--> statement-breakpoint
CREATE INDEX "invoices_account_date_idx" ON "invoices" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "invoices_client_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "line_items_invoice_idx" ON "line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "line_items_account_version_idx" ON "line_items" USING btree ("account_id","version");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_account_version_idx" ON "payments" USING btree ("account_id","version");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));