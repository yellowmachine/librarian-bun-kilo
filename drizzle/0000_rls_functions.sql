-- Funciones SECURITY DEFINER que usan las políticas RLS (schema.ts): consultan
-- group_members y groups saltándose su RLS, para evitar la recursión de las
-- políticas de group_members sobre sí mismas. Van antes que las tablas porque
-- CREATE POLICY las necesita; en plpgsql, Postgres no valida el cuerpo al crearlas.
CREATE FUNCTION is_group_member(p_group_id text, p_user_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id AND user_id = p_user_id
    );
END;
$$;
--> statement-breakpoint
CREATE FUNCTION is_group_admin(p_group_id text, p_user_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id AND user_id = p_user_id
          AND role IN ('owner', 'admin')
    );
END;
$$;
--> statement-breakpoint
-- Quien creó el grupo: puede entrar en él como owner (createGroup), aunque aún
-- no sea miembro y por tanto no lo vea.
CREATE FUNCTION is_group_creator(p_group_id text, p_user_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM groups
        WHERE id = p_group_id AND created_by = p_user_id
    );
END;
$$;
--> statement-breakpoint
-- Los miembros de un grupo con su nombre y email, solo si quien pregunta
-- (app.current_user_id, puesto por withRLS) es uno de ellos (groups.ts).
CREATE FUNCTION get_group_members(p_group_id text)
RETURNS TABLE(user_id text, role text, joined_at timestamp, name text, email text)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT gm.user_id, gm.role::text, gm.joined_at, u.name, u.email
    FROM group_members gm
    JOIN "user" u ON u.id = gm.user_id
    WHERE gm.group_id = p_group_id
      AND EXISTS (
          SELECT 1 FROM group_members me
          WHERE me.group_id = p_group_id
            AND me.user_id = current_setting('app.current_user_id', true)
      );
END;
$$;
