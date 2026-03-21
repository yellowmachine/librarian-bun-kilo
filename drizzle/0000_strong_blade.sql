CREATE SCHEMA "librarian";
--> statement-breakpoint
CREATE TYPE "librarian"."group_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "librarian"."loan_status" AS ENUM('requested', 'accepted', 'active', 'return_requested', 'returned', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "librarian"."book_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "librarian"."book_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "librarian"."books" (
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
ALTER TABLE "librarian"."books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "librarian"."group_members" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "librarian"."group_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "librarian"."group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "librarian"."groups" (
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
ALTER TABLE "librarian"."groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "librarian"."loans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_book_id" text NOT NULL,
	"borrower_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"status" "librarian"."loan_status" DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"active_at" timestamp,
	"return_requested_at" timestamp,
	"returned_at" timestamp,
	"due_date" timestamp,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "librarian"."loans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "librarian"."shared_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_id" text NOT NULL,
	"group_id" text NOT NULL,
	"shared_by" text NOT NULL,
	"shared_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "librarian"."shared_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "librarian"."tags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "librarian"."tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "librarian"."user_book_tags" (
	"user_book_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "librarian"."user_book_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "librarian"."user_books" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" text NOT NULL,
	"notes" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "librarian"."user_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "librarian"."user_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE "librarian"."book_reviews" ADD CONSTRAINT "book_reviews_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "librarian"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."book_reviews" ADD CONSTRAINT "book_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "librarian"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."group_members" ADD CONSTRAINT "group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."groups" ADD CONSTRAINT "groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."loans" ADD CONSTRAINT "loans_user_book_id_user_books_id_fk" FOREIGN KEY ("user_book_id") REFERENCES "librarian"."user_books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."loans" ADD CONSTRAINT "loans_borrower_id_user_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."loans" ADD CONSTRAINT "loans_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."shared_tags" ADD CONSTRAINT "shared_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "librarian"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."shared_tags" ADD CONSTRAINT "shared_tags_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "librarian"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."shared_tags" ADD CONSTRAINT "shared_tags_shared_by_user_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."user_book_tags" ADD CONSTRAINT "user_book_tags_user_book_id_user_books_id_fk" FOREIGN KEY ("user_book_id") REFERENCES "librarian"."user_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."user_book_tags" ADD CONSTRAINT "user_book_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "librarian"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD CONSTRAINT "user_books_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD CONSTRAINT "user_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "librarian"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "book_reviews_book_user_idx" ON "librarian"."book_reviews" USING btree ("book_id","user_id");--> statement-breakpoint
CREATE INDEX "book_reviews_book_idx" ON "librarian"."book_reviews" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "book_reviews_user_idx" ON "librarian"."book_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "books_isbn_idx" ON "librarian"."books" USING btree ("isbn");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_pk" ON "librarian"."group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "librarian"."group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "loans_borrower_idx" ON "librarian"."loans" USING btree ("borrower_id");--> statement-breakpoint
CREATE INDEX "loans_owner_idx" ON "librarian"."loans" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "loans_user_book_idx" ON "librarian"."loans" USING btree ("user_book_id");--> statement-breakpoint
CREATE INDEX "loans_status_idx" ON "librarian"."loans" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_tags_tag_group_idx" ON "librarian"."shared_tags" USING btree ("tag_id","group_id");--> statement-breakpoint
CREATE INDEX "shared_tags_group_idx" ON "librarian"."shared_tags" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_idx" ON "librarian"."tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "tags_user_idx" ON "librarian"."tags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_book_tags_pk" ON "librarian"."user_book_tags" USING btree ("user_book_id","tag_id");--> statement-breakpoint
CREATE INDEX "user_book_tags_tag_idx" ON "librarian"."user_book_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_books_user_book_idx" ON "librarian"."user_books" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX "user_books_user_idx" ON "librarian"."user_books" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_books_book_idx" ON "librarian"."user_books" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE POLICY "book_reviews_select" ON "librarian"."book_reviews" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "book_reviews_insert" ON "librarian"."book_reviews" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("librarian"."book_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "book_reviews_update" ON "librarian"."book_reviews" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("librarian"."book_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "book_reviews_delete" ON "librarian"."book_reviews" AS PERMISSIVE FOR DELETE TO "app_user" USING ("librarian"."book_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "books_select" ON "librarian"."books" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "books_insert" ON "librarian"."books" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "books_update" ON "librarian"."books" AS PERMISSIVE FOR UPDATE TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "group_members_select" ON "librarian"."group_members" AS PERMISSIVE FOR SELECT TO "app_user" USING ("librarian"."group_members"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "group_members_insert" ON "librarian"."group_members" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (exists (
					select 1 from group_members gm
					where gm.group_id = "librarian"."group_members"."group_id"
					  and gm.user_id = current_setting('app.current_user_id', true)
					  and gm.role in ('owner', 'admin')
				));--> statement-breakpoint
CREATE POLICY "group_members_delete" ON "librarian"."group_members" AS PERMISSIVE FOR DELETE TO "app_user" USING ("librarian"."group_members"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "groups_select" ON "librarian"."groups" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from group_members gm
				where gm.group_id = "librarian"."groups"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "groups_insert" ON "librarian"."groups" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("librarian"."groups"."created_by" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "groups_update" ON "librarian"."groups" AS PERMISSIVE FOR UPDATE TO "app_user" USING (exists (
				select 1 from group_members gm
				where gm.group_id = "librarian"."groups"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
				  and gm.role in ('owner', 'admin')
			));--> statement-breakpoint
CREATE POLICY "groups_delete" ON "librarian"."groups" AS PERMISSIVE FOR DELETE TO "app_user" USING (exists (
				select 1 from group_members gm
				where gm.group_id = "librarian"."groups"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
				  and gm.role = 'owner'
			));--> statement-breakpoint
CREATE POLICY "loans_select" ON "librarian"."loans" AS PERMISSIVE FOR SELECT TO "app_user" USING ("librarian"."loans"."owner_id" = current_setting('app.current_user_id', true)
				or "librarian"."loans"."borrower_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "loans_insert" ON "librarian"."loans" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("librarian"."loans"."borrower_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "loans_update" ON "librarian"."loans" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("librarian"."loans"."owner_id" = current_setting('app.current_user_id', true)
				or "librarian"."loans"."borrower_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "loans_delete" ON "librarian"."loans" AS PERMISSIVE FOR DELETE TO "app_user" USING ("librarian"."loans"."borrower_id" = current_setting('app.current_user_id', true)
				and "librarian"."loans"."status" = 'requested');--> statement-breakpoint
CREATE POLICY "shared_tags_select" ON "librarian"."shared_tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from group_members gm
				where gm.group_id = "librarian"."shared_tags"."group_id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "shared_tags_insert" ON "librarian"."shared_tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("librarian"."shared_tags"."shared_by" = current_setting('app.current_user_id', true)
				and exists (
					select 1 from group_members gm
					where gm.group_id = "librarian"."shared_tags"."group_id"
					  and gm.user_id = current_setting('app.current_user_id', true)
				));--> statement-breakpoint
CREATE POLICY "shared_tags_delete" ON "librarian"."shared_tags" AS PERMISSIVE FOR DELETE TO "app_user" USING ("librarian"."shared_tags"."shared_by" = current_setting('app.current_user_id', true)
				or exists (
					select 1 from group_members gm
					where gm.group_id = "librarian"."shared_tags"."group_id"
					  and gm.user_id = current_setting('app.current_user_id', true)
					  and gm.role in ('owner', 'admin')
				));--> statement-breakpoint
CREATE POLICY "tags_select" ON "librarian"."tags" AS PERMISSIVE FOR SELECT TO "app_user" USING ("librarian"."tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tags_insert" ON "librarian"."tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("librarian"."tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tags_update" ON "librarian"."tags" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("librarian"."tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tags_delete" ON "librarian"."tags" AS PERMISSIVE FOR DELETE TO "app_user" USING ("librarian"."tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_book_tags_select" ON "librarian"."user_book_tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from user_books ub
				where ub.id = "librarian"."user_book_tags"."user_book_id"
				  and ub.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_book_tags_insert" ON "librarian"."user_book_tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (exists (
				select 1 from user_books ub
				where ub.id = "librarian"."user_book_tags"."user_book_id"
				  and ub.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_book_tags_delete" ON "librarian"."user_book_tags" AS PERMISSIVE FOR DELETE TO "app_user" USING (exists (
				select 1 from user_books ub
				where ub.id = "librarian"."user_book_tags"."user_book_id"
				  and ub.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_books_select" ON "librarian"."user_books" AS PERMISSIVE FOR SELECT TO "app_user" USING ("librarian"."user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_books_insert" ON "librarian"."user_books" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("librarian"."user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_books_update" ON "librarian"."user_books" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("librarian"."user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_books_delete" ON "librarian"."user_books" AS PERMISSIVE FOR DELETE TO "app_user" USING ("librarian"."user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_profile_select" ON "librarian"."user_profile" AS PERMISSIVE FOR SELECT TO "app_user" USING ("librarian"."user_profile"."user_id" = current_setting('app.current_user_id', true));