CREATE TYPE "public"."group_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('requested', 'accepted', 'active', 'return_requested', 'returned', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "book_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"alternate_title" text,
	"openlibrary_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "group_invite_codes" (
	"group_id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "group_invite_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"invited_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"cancelled_at" timestamp,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "libraries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "libraries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"notes" text,
	"owner_notes" text
);
--> statement-breakpoint
ALTER TABLE "loans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shared_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_id" text NOT NULL,
	"group_id" text NOT NULL,
	"shared_by" text NOT NULL,
	"shared_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_api_keys" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_book_tags" (
	"user_book_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_book_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_books" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"library_id" text NOT NULL,
	"book_id" text,
	"title" text,
	"authors" text[],
	"isbn" text,
	"description" text,
	"publish_year" integer,
	"alternate_title" text,
	"cover_url" text,
	"notes" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_books_book_or_title" CHECK ("user_books"."book_id" IS NOT NULL OR "user_books"."title" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "user_books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE "book_reviews" ADD CONSTRAINT "book_reviews_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_reviews" ADD CONSTRAINT "book_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invite_codes" ADD CONSTRAINT "group_invite_codes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "libraries" ADD CONSTRAINT "libraries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_book_id_user_books_id_fk" FOREIGN KEY ("user_book_id") REFERENCES "public"."user_books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrower_id_user_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_tags" ADD CONSTRAINT "shared_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_tags" ADD CONSTRAINT "shared_tags_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_tags" ADD CONSTRAINT "shared_tags_shared_by_user_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_book_tags" ADD CONSTRAINT "user_book_tags_user_book_id_user_books_id_fk" FOREIGN KEY ("user_book_id") REFERENCES "public"."user_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_book_tags" ADD CONSTRAINT "user_book_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_books" ADD CONSTRAINT "user_books_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_books" ADD CONSTRAINT "user_books_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_books" ADD CONSTRAINT "user_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "book_reviews_book_user_idx" ON "book_reviews" USING btree ("book_id","user_id");--> statement-breakpoint
CREATE INDEX "book_reviews_book_idx" ON "book_reviews" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "book_reviews_user_idx" ON "book_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "books_isbn_idx" ON "books" USING btree ("isbn");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_pk" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_open_email_idx" ON "invitations" USING btree (lower("email")) WHERE "invitations"."used_at" is null and "invitations"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "invitations_invited_by_idx" ON "invitations" USING btree ("invited_by");--> statement-breakpoint
CREATE UNIQUE INDEX "libraries_user_default_idx" ON "libraries" USING btree ("user_id") WHERE "libraries"."is_default" = true;--> statement-breakpoint
CREATE INDEX "libraries_user_idx" ON "libraries" USING btree ("user_id");--> statement-breakpoint
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
CREATE INDEX "user_books_user_idx" ON "user_books" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_books_book_idx" ON "user_books" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "user_books_library_idx" ON "user_books" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE POLICY "book_reviews_select" ON "book_reviews" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "book_reviews_insert" ON "book_reviews" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("book_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "book_reviews_update" ON "book_reviews" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("book_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "book_reviews_delete" ON "book_reviews" AS PERMISSIVE FOR DELETE TO "app_user" USING ("book_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "books_select" ON "books" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "books_insert" ON "books" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "books_update" ON "books" AS PERMISSIVE FOR UPDATE TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "group_invite_codes_select" ON "group_invite_codes" AS PERMISSIVE FOR SELECT TO "app_user" USING (is_group_member("group_invite_codes"."group_id", current_setting('app.current_user_id', true)) or "group_invite_codes"."code" = current_setting('app.invite_code', true));--> statement-breakpoint
CREATE POLICY "group_invite_codes_insert" ON "group_invite_codes" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (is_group_admin("group_invite_codes"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "group_invite_codes_update" ON "group_invite_codes" AS PERMISSIVE FOR UPDATE TO "app_user" USING (is_group_admin("group_invite_codes"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "group_invite_codes_delete" ON "group_invite_codes" AS PERMISSIVE FOR DELETE TO "app_user" USING (is_group_admin("group_invite_codes"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "group_members_select" ON "group_members" AS PERMISSIVE FOR SELECT TO "app_user" USING ("group_members"."user_id" = current_setting('app.current_user_id', true) or is_group_member("group_members"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "group_members_insert" ON "group_members" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (is_group_admin("group_members"."group_id", current_setting('app.current_user_id', true))
				or ("group_members"."user_id" = current_setting('app.current_user_id', true) and (
					("group_members"."role" = 'member' and exists (
						select 1 from group_invite_codes c
						where c.group_id = "group_members"."group_id" and c.code = current_setting('app.invite_code', true)
					))
					or ("group_members"."role" = 'owner' and is_group_creator("group_members"."group_id", current_setting('app.current_user_id', true)))
				)));--> statement-breakpoint
CREATE POLICY "group_members_delete" ON "group_members" AS PERMISSIVE FOR DELETE TO "app_user" USING ("group_members"."user_id" = current_setting('app.current_user_id', true) or is_group_admin("group_members"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "groups_select" ON "groups" AS PERMISSIVE FOR SELECT TO "app_user" USING (is_group_member("groups"."id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "groups_insert" ON "groups" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("groups"."created_by" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "groups_update" ON "groups" AS PERMISSIVE FOR UPDATE TO "app_user" USING (is_group_admin("groups"."id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "groups_delete" ON "groups" AS PERMISSIVE FOR DELETE TO "app_user" USING (is_group_admin("groups"."id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "libraries_select" ON "libraries" AS PERMISSIVE FOR SELECT TO "app_user" USING ("libraries"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "libraries_insert" ON "libraries" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("libraries"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "libraries_update" ON "libraries" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("libraries"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "libraries_delete" ON "libraries" AS PERMISSIVE FOR DELETE TO "app_user" USING ("libraries"."user_id" = current_setting('app.current_user_id', true) and not "libraries"."is_default");--> statement-breakpoint
CREATE POLICY "loans_select" ON "loans" AS PERMISSIVE FOR SELECT TO "app_user" USING ("loans"."owner_id" = current_setting('app.current_user_id', true)
				or "loans"."borrower_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "loans_insert" ON "loans" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("loans"."borrower_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "loans_update" ON "loans" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("loans"."owner_id" = current_setting('app.current_user_id', true)
				or "loans"."borrower_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "loans_delete" ON "loans" AS PERMISSIVE FOR DELETE TO "app_user" USING ("loans"."borrower_id" = current_setting('app.current_user_id', true)
				and "loans"."status" = 'requested');--> statement-breakpoint
CREATE POLICY "shared_tags_select" ON "shared_tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (is_group_member("shared_tags"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "shared_tags_insert" ON "shared_tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("shared_tags"."shared_by" = current_setting('app.current_user_id', true) and is_group_member("shared_tags"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "shared_tags_delete" ON "shared_tags" AS PERMISSIVE FOR DELETE TO "app_user" USING ("shared_tags"."shared_by" = current_setting('app.current_user_id', true) or is_group_admin("shared_tags"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "tags_select" ON "tags" AS PERMISSIVE FOR SELECT TO "app_user" USING ("tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tags_select_in_group" ON "tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from shared_tags st
				join group_members gm on gm.group_id = st.group_id
				where st.tag_id = "tags"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "tags_insert" ON "tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tags_update" ON "tags" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tags_delete" ON "tags" AS PERMISSIVE FOR DELETE TO "app_user" USING ("tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_api_keys_all" ON "user_api_keys" AS PERMISSIVE FOR ALL TO "app_user" USING ("user_api_keys"."user_id" = current_setting('app.current_user_id', true)) WITH CHECK ("user_api_keys"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_book_tags_select" ON "user_book_tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from tags t
				where t.id = "user_book_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_book_tags_select_in_group" ON "user_book_tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from shared_tags st
				join group_members gm on gm.group_id = st.group_id
				where st.tag_id = "user_book_tags"."tag_id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_book_tags_insert" ON "user_book_tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (exists (
				select 1 from tags t
				where t.id = "user_book_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_book_tags_delete" ON "user_book_tags" AS PERMISSIVE FOR DELETE TO "app_user" USING (exists (
				select 1 from tags t
				where t.id = "user_book_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_books_select" ON "user_books" AS PERMISSIVE FOR SELECT TO "app_user" USING ("user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_books_select_in_group" ON "user_books" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from user_book_tags ubt
				join shared_tags st on st.tag_id = ubt.tag_id
				join group_members gm on gm.group_id = st.group_id
				where ubt.user_book_id = "user_books"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_books_select_on_loan" ON "user_books" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from loans l
				where l.user_book_id = "user_books"."id"
				  and l.borrower_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_books_insert" ON "user_books" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_books_update" ON "user_books" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_books_delete" ON "user_books" AS PERMISSIVE FOR DELETE TO "app_user" USING ("user_books"."user_id" = current_setting('app.current_user_id', true));