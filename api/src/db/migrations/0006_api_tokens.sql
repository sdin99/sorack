-- API tokens for programmatic callers. Hand-written: `drizzle-kit generate`
-- also emitted a CREATE TABLE for docs.git_config, because that table was
-- introduced by a hand-written migration (0004) that the drizzle snapshot
-- never recorded. Applying the generated file as-is would fail on an
-- existing database with "relation already exists".
CREATE TABLE IF NOT EXISTS "auth"."api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"token_hash" text NOT NULL,
	"scope" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
