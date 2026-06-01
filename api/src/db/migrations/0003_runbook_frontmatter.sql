ALTER TYPE "docs"."runbook_category" ADD VALUE 'incident';--> statement-breakpoint
ALTER TYPE "docs"."runbook_category" ADD VALUE 'postmortem';--> statement-breakpoint
ALTER TYPE "docs"."runbook_category" ADD VALUE 'design_doc';--> statement-breakpoint
ALTER TABLE "docs"."runbooks" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "docs"."runbooks" ADD COLUMN "meta" jsonb DEFAULT '{"tags":[],"runbookRefs":[],"severity":"","author":"","template":null,"schema":1}'::jsonb NOT NULL;