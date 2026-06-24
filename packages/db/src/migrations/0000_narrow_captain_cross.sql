CREATE TABLE "balances" (
	"address" text NOT NULL,
	"contract_address" text NOT NULL,
	"balance_cleartext" text,
	"balance_status" text NOT NULL,
	"block_number" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balances_address_contract_address_pk" PRIMARY KEY("address","contract_address")
);
--> statement-breakpoint
CREATE TABLE "decrypt_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"attempt_num" integer NOT NULL,
	"outcome" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_state" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"indexed_block" bigint NOT NULL,
	"latest_chain_block" bigint NOT NULL,
	"pending_decryption_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone,
	"kind" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"amount_handle" text NOT NULL,
	"amount_status" text NOT NULL,
	"amount_cleartext" text,
	"contract_address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decrypt_attempts" ADD CONSTRAINT "decrypt_attempts_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decrypt_attempts_transfer_idx" ON "decrypt_attempts" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "transfers_from_block_idx" ON "transfers" USING btree ("from_address","block_number","log_index");--> statement-breakpoint
CREATE INDEX "transfers_to_block_idx" ON "transfers" USING btree ("to_address","block_number","log_index");--> statement-breakpoint
CREATE INDEX "transfers_amount_status_idx" ON "transfers" USING btree ("amount_status");