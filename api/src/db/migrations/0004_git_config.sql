CREATE TABLE "docs"."git_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"remote" text,
	"branch" text,
	"username" text,
	"token" text,
	"author_name" text,
	"author_email" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "git_config_single_row" CHECK ("id" = 1)
);
