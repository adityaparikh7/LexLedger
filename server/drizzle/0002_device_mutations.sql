CREATE TABLE "device_mutations" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"last_mutation_id" bigint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_mutations" ADD CONSTRAINT "device_mutations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;