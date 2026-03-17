CREATE TYPE "public"."group_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('requested', 'accepted', 'active', 'return_requested', 'returned', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "books" (
	"id" text PRIMARY KEY NOT NULL,
	"isbn" text,
	"title" text NOT NULL,
	"authors" text[],
	"cover_url" text,
	"publish_year" integer,
	"publisher" text,
	"language" text,
	"description" text,
	"openlibrary_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"invite_code" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "groups_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_book_id" text NOT NULL,
	"borrower_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"status" "loan_status" DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"active_at" timestamp,
	"return_requested_at" timestamp,
	"returned_at" timestamp,
	"due_date" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "shared_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_id" text NOT NULL,
	"group_id" text NOT NULL,
	"shared_by" text NOT NULL,
	"shared_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_book_tags" (
	"user_book_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_books" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" text NOT NULL,
	"notes" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_book_id_user_books_id_fk" FOREIGN KEY ("user_book_id") REFERENCES "public"."user_books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrower_id_user_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_tags" ADD CONSTRAINT "shared_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_tags" ADD CONSTRAINT "shared_tags_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_tags" ADD CONSTRAINT "shared_tags_shared_by_user_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_book_tags" ADD CONSTRAINT "user_book_tags_user_book_id_user_books_id_fk" FOREIGN KEY ("user_book_id") REFERENCES "public"."user_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_book_tags" ADD CONSTRAINT "user_book_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_books" ADD CONSTRAINT "user_books_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_books" ADD CONSTRAINT "user_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "books_isbn_idx" ON "books" USING btree ("isbn");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_pk" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "loans_borrower_idx" ON "loans" USING btree ("borrower_id");--> statement-breakpoint
CREATE INDEX "loans_owner_idx" ON "loans" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "loans_user_book_idx" ON "loans" USING btree ("user_book_id");--> statement-breakpoint
CREATE INDEX "loans_status_idx" ON "loans" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_tags_tag_group_idx" ON "shared_tags" USING btree ("tag_id","group_id");--> statement-breakpoint
CREATE INDEX "shared_tags_group_idx" ON "shared_tags" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_idx" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "tags_user_idx" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_book_tags_pk" ON "user_book_tags" USING btree ("user_book_id","tag_id");--> statement-breakpoint
CREATE INDEX "user_book_tags_tag_idx" ON "user_book_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_books_user_book_idx" ON "user_books" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX "user_books_user_idx" ON "user_books" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_books_book_idx" ON "user_books" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");