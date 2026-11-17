ALTER TABLE "loans" DROP CONSTRAINT "loans_borrower_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "borrower_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_name" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrower_id_user_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Al borrar la cuenta, sus grupos pasan a otro miembro (accountDeletion.ts). Como
-- el rol no se cambia desde la app, group_members no tiene política de UPDATE:
-- esta función lo hace, y solo para quien creó el grupo (el que se va) y hacia
-- un miembro que ya está dentro. created_by pasa también: es quien puede borrarlo.
CREATE FUNCTION hand_over_group(p_group_id text, p_heir_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM groups
        WHERE id = p_group_id AND created_by = current_setting('app.current_user_id', true)
    ) THEN
        RAISE EXCEPTION 'Only the group creator can hand it over';
    END IF;
    UPDATE group_members SET role = 'owner'
    WHERE group_id = p_group_id AND user_id = p_heir_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The heir is not a member of the group';
    END IF;
    UPDATE groups SET created_by = p_heir_id, updated_at = now() WHERE id = p_group_id;
END;
$$;
