CREATE SCHEMA "docs";
--> statement-breakpoint
CREATE SCHEMA "inventory";
--> statement-breakpoint
CREATE SCHEMA "monitoring";
--> statement-breakpoint
CREATE TYPE "monitoring"."alert_severity" AS ENUM('ok', 'warn', 'err');--> statement-breakpoint
CREATE TYPE "docs"."runbook_category" AS ENUM('task', 'sop');--> statement-breakpoint
CREATE TYPE "docs"."runbook_status" AS ENUM('planned', 'in_progress', 'completed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "inventory"."status" AS ENUM('ok', 'warn', 'err', 'unknown');--> statement-breakpoint
CREATE TABLE "monitoring"."alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"severity" "monitoring"."alert_severity" NOT NULL,
	"title" varchar(512) NOT NULL,
	"detail" text,
	"node_id" varchar(128),
	"age" varchar(32),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory"."edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"target_id" varchar(128) NOT NULL,
	"type" varchar(64) DEFAULT 'contains' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory"."nodes" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"type" varchar(64) NOT NULL,
	"parent_id" varchar(128),
	"name" varchar(256) NOT NULL,
	"status" "inventory"."status" DEFAULT 'unknown' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "docs"."runbooks" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"title" varchar(512) NOT NULL,
	"category" "docs"."runbook_category" DEFAULT 'task' NOT NULL,
	"status" "docs"."runbook_status" DEFAULT 'planned' NOT NULL,
	"markdown" text DEFAULT '' NOT NULL,
	"node_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
