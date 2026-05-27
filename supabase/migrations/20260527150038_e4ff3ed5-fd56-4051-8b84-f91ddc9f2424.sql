-- TABLES
CREATE TABLE public.clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 18),
  motto text NOT NULL DEFAULT '' CHECK (length(motto) <= 100),
  tag text NOT NULL UNIQUE CHECK (length(trim(tag)) BETWEEN 1 AND 3),
  emblem text NOT NULL DEFAULT 'default',
  leader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recruitment_status text NOT NULL DEFAULT 'open'
    CHECK (recruitment_status IN ('open', 'selection', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clans_leader ON public.clans(leader_id);
CREATE INDEX idx_clans_name ON public.clans(lower(name));

GRANT SELECT ON public.clans TO authenticated;
GRANT ALL ON public.clans TO service_role;
ALTER TABLE public.clans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clans_select_all" ON public.clans FOR SELECT TO authenticated USING (true);

CREATE TABLE public.clan_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'member')),
  competition_points integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX idx_cm_clan ON public.clan_members(clan_id, role);
CREATE INDEX idx_cm_user ON public.clan_members(user_id);

GRANT SELECT ON public.clan_members TO authenticated;
GRANT ALL ON public.clan_members TO service_role;
ALTER TABLE public.clan_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_select_all" ON public.clan_members FOR SELECT TO authenticated USING (true);

CREATE TABLE public.clan_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clan_id, user_id)
);
CREATE INDEX idx_cjr_clan_pending ON public.clan_join_requests(clan_id, status);

GRANT SELECT ON public.clan_join_requests TO authenticated;
GRANT ALL ON public.clan_join_requests TO service_role;
ALTER TABLE public.clan_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cjr_select_own" ON public.clan_join_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.clan_members m
    WHERE m.clan_id = clan_join_requests.clan_id AND m.user_id = auth.uid()
      AND m.role IN ('leader','officer')
  ));

CREATE TABLE public.clan_mail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  type text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
CREATE INDEX idx_cmail_clan ON public.clan_mail(clan_id, created_at DESC);

GRANT SELECT ON public.clan_mail TO authenticated;
GRANT ALL ON public.clan_mail TO service_role;
ALTER TABLE public.clan_mail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmail_select_member" ON public.clan_mail
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clan_members m
    WHERE m.clan_id = clan_mail.clan_id AND m.user_id = auth.uid()
  ));

CREATE TABLE public.clan_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_cmsgs_clan ON public.clan_messages(clan_id, created_at);

GRANT SELECT ON public.clan_messages TO authenticated;
GRANT ALL ON public.clan_messages TO service_role;
ALTER TABLE public.clan_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmsgs_select_member" ON public.clan_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clan_members m
    WHERE m.clan_id = clan_messages.clan_id AND m.user_id = auth.uid()
  ));

-- HELPERS
CREATE OR REPLACE FUNCTION public._add_clan_mail(
  _clan_id uuid, _type text, _content jsonb, _triggered_by uuid DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.clan_mail (clan_id, type, content, triggered_by)
  VALUES (_clan_id, _type, _content, _triggered_by);
$$;

-- RPCs
CREATE OR REPLACE FUNCTION public.create_clan(_name text, _motto text, _tag text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _clan_id uuid;
  _name_clean text := trim(_name);
  _tag_clean text := trim(upper(_tag));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = _uid) THEN
    RAISE EXCEPTION 'Já pertences a um clã';
  END IF;
  IF length(_name_clean) < 1 OR length(_name_clean) > 18 THEN
    RAISE EXCEPTION 'O nome deve ter entre 1 e 18 caracteres';
  END IF;
  IF length(_tag_clean) < 1 OR length(_tag_clean) > 3 THEN
    RAISE EXCEPTION 'A sigla deve ter entre 1 e 3 caracteres';
  END IF;
  IF length(_motto) > 100 THEN
    RAISE EXCEPTION 'O lema não pode ter mais de 100 caracteres';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans WHERE lower(name) = lower(_name_clean)) THEN
    RAISE EXCEPTION 'Já existe um clã com esse nome';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans WHERE upper(tag) = _tag_clean) THEN
    RAISE EXCEPTION 'Já existe um clã com essa sigla';
  END IF;
  IF (SELECT COALESCE(coins, 0) FROM public.profiles WHERE user_id = _uid) < 1000 THEN
    RAISE EXCEPTION 'Precisas de 1000 moedas para criar um clã';
  END IF;
  UPDATE public.profiles SET coins = coins - 1000 WHERE user_id = _uid;
  INSERT INTO public.clans (name, motto, tag, leader_id)
  VALUES (_name_clean, _motto, _tag_clean, _uid)
  RETURNING id INTO _clan_id;
  INSERT INTO public.clan_members (clan_id, user_id, role)
  VALUES (_clan_id, _uid, 'leader');
  RETURN jsonb_build_object('clan_id', _clan_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_clan(_clan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _clan record;
  _member_count integer;
  _user_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = _uid) THEN
    RAISE EXCEPTION 'Já pertences a um clã';
  END IF;
  SELECT * INTO _clan FROM public.clans WHERE id = _clan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clã não encontrado'; END IF;
  SELECT COUNT(*) INTO _member_count FROM public.clan_members WHERE clan_id = _clan_id;
  IF _member_count >= 30 THEN RAISE EXCEPTION 'Clã cheio (30/30)'; END IF;
  IF _clan.recruitment_status = 'closed' THEN
    RAISE EXCEPTION 'Este clã não está a aceitar novos membros';
  END IF;
  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _user_name
  FROM public.profiles WHERE user_id = _uid;
  IF _clan.recruitment_status = 'open' THEN
    INSERT INTO public.clan_members (clan_id, user_id, role)
    VALUES (_clan_id, _uid, 'member');
    RETURN jsonb_build_object('status', 'joined');
  END IF;
  INSERT INTO public.clan_join_requests (clan_id, user_id)
  VALUES (_clan_id, _uid)
  ON CONFLICT (clan_id, user_id) DO UPDATE SET status = 'pending', created_at = now();
  PERFORM public._add_clan_mail(
    _clan_id, 'join_request',
    jsonb_build_object('user_id', _uid, 'user_name', _user_name),
    _uid
  );
  RETURN jsonb_build_object('status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_join_request(_request_id uuid, _accept boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _req record;
  _member_count integer;
  _user_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND OR _me.role NOT IN ('leader','officer') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  SELECT * INTO _req FROM public.clan_join_requests
  WHERE id = _request_id AND clan_id = _me.clan_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF _accept THEN
    SELECT COUNT(*) INTO _member_count FROM public.clan_members WHERE clan_id = _me.clan_id;
    IF _member_count >= 30 THEN RAISE EXCEPTION 'Clã cheio'; END IF;
    UPDATE public.clan_join_requests SET status = 'accepted' WHERE id = _request_id;
    INSERT INTO public.clan_members (clan_id, user_id, role)
    VALUES (_me.clan_id, _req.user_id, 'member');
    SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _user_name
    FROM public.profiles WHERE user_id = _req.user_id;
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (_req.user_id, 'clan_join_accepted', 'Pedido de clã aceite',
      'O teu pedido para entrar no clã foi aceite!');
    RETURN jsonb_build_object('status', 'accepted');
  ELSE
    UPDATE public.clan_join_requests SET status = 'rejected' WHERE id = _request_id;
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (_req.user_id, 'clan_join_rejected', 'Pedido de clã recusado',
      'O teu pedido para entrar no clã foi recusado.');
    RETURN jsonb_build_object('status', 'rejected');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_clan()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _user_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não pertences a nenhum clã'; END IF;
  IF _me.role = 'leader' THEN
    IF EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = _me.clan_id AND user_id <> _uid) THEN
      RAISE EXCEPTION 'Deves ceder a liderança antes de sair';
    END IF;
    DELETE FROM public.clan_members WHERE clan_id = _me.clan_id;
    DELETE FROM public.clans WHERE id = _me.clan_id;
    RETURN;
  END IF;
  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _user_name
  FROM public.profiles WHERE user_id = _uid;
  DELETE FROM public.clan_members WHERE user_id = _uid;
  PERFORM public._add_clan_mail(
    _me.clan_id, 'member_left',
    jsonb_build_object('user_id', _uid, 'user_name', _user_name, 'role', _me.role),
    _uid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kick_clan_member(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _target record;
  _target_name text;
  _my_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _uid = _target_user_id THEN RAISE EXCEPTION 'Não te podes expulsar a ti próprio'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND OR _me.role = 'member' THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO _target FROM public.clan_members
  WHERE user_id = _target_user_id AND clan_id = _me.clan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilizador não é membro do clã'; END IF;
  IF _me.role = 'officer' AND _target.role <> 'member' THEN
    RAISE EXCEPTION 'Os oficiais só podem expulsar membros';
  END IF;
  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _target_name
  FROM public.profiles WHERE user_id = _target_user_id;
  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _my_name
  FROM public.profiles WHERE user_id = _uid;
  DELETE FROM public.clan_members WHERE user_id = _target_user_id;
  PERFORM public._add_clan_mail(
    _me.clan_id, 'member_kicked',
    jsonb_build_object('user_id', _target_user_id, 'user_name', _target_name,
                       'kicked_by', _uid, 'kicked_by_name', _my_name),
    _uid
  );
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (_target_user_id, 'clan_kicked', 'Expulso do clã',
    'Foste expulso do clã por ' || _my_name || '.');
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_to_officer(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _target record;
  _officer_count integer;
  _target_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND OR _me.role <> 'leader' THEN RAISE EXCEPTION 'Apenas o líder pode promover'; END IF;
  SELECT * INTO _target FROM public.clan_members
  WHERE user_id = _target_user_id AND clan_id = _me.clan_id AND role = 'member';
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilizador não encontrado ou não é membro'; END IF;
  SELECT COUNT(*) INTO _officer_count FROM public.clan_members
  WHERE clan_id = _me.clan_id AND role = 'officer';
  IF _officer_count >= 5 THEN RAISE EXCEPTION 'Limite de 5 oficiais atingido'; END IF;
  UPDATE public.clan_members SET role = 'officer' WHERE user_id = _target_user_id;
  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _target_name
  FROM public.profiles WHERE user_id = _target_user_id;
  PERFORM public._add_clan_mail(
    _me.clan_id, 'member_promoted',
    jsonb_build_object('user_id', _target_user_id, 'user_name', _target_name),
    _uid
  );
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (_target_user_id, 'clan_promoted', 'Promovido a Oficial!',
    'Foste promovido a oficial do clã.');
END;
$$;

CREATE OR REPLACE FUNCTION public.demote_to_member(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _target_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND OR _me.role <> 'leader' THEN RAISE EXCEPTION 'Apenas o líder pode demover'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clan_members
    WHERE user_id = _target_user_id AND clan_id = _me.clan_id AND role = 'officer') THEN
    RAISE EXCEPTION 'Utilizador não é oficial deste clã';
  END IF;
  UPDATE public.clan_members SET role = 'member' WHERE user_id = _target_user_id;
  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _target_name
  FROM public.profiles WHERE user_id = _target_user_id;
  PERFORM public._add_clan_mail(
    _me.clan_id, 'member_demoted',
    jsonb_build_object('user_id', _target_user_id, 'user_name', _target_name),
    _uid
  );
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (_target_user_id, 'clan_demoted', 'Demovido a Membro',
    'Foste demovido a membro do clã.');
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_leadership(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _target_name text;
  _my_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND OR _me.role <> 'leader' THEN RAISE EXCEPTION 'Apenas o líder pode ceder a liderança'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clan_members
    WHERE user_id = _target_user_id AND clan_id = _me.clan_id AND role = 'officer') THEN
    RAISE EXCEPTION 'Só podes ceder a liderança a um oficial';
  END IF;
  UPDATE public.clan_members SET role = 'officer' WHERE user_id = _uid;
  UPDATE public.clan_members SET role = 'leader' WHERE user_id = _target_user_id;
  UPDATE public.clans SET leader_id = _target_user_id WHERE id = _me.clan_id;
  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _target_name
  FROM public.profiles WHERE user_id = _target_user_id;
  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _my_name
  FROM public.profiles WHERE user_id = _uid;
  PERFORM public._add_clan_mail(
    _me.clan_id, 'leadership_transferred',
    jsonb_build_object('new_leader_id', _target_user_id, 'new_leader_name', _target_name,
                       'old_leader_id', _uid, 'old_leader_name', _my_name),
    _uid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_clan_profile(_name text, _motto text, _tag text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _name_clean text := trim(_name);
  _tag_clean text := trim(upper(_tag));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND OR _me.role <> 'leader' THEN RAISE EXCEPTION 'Apenas o líder pode editar o clã'; END IF;
  IF length(_name_clean) < 1 OR length(_name_clean) > 18 THEN
    RAISE EXCEPTION 'O nome deve ter entre 1 e 18 caracteres';
  END IF;
  IF length(_tag_clean) < 1 OR length(_tag_clean) > 3 THEN
    RAISE EXCEPTION 'A sigla deve ter entre 1 e 3 caracteres';
  END IF;
  IF length(_motto) > 100 THEN
    RAISE EXCEPTION 'O lema não pode ter mais de 100 caracteres';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans
    WHERE lower(name) = lower(_name_clean) AND id <> _me.clan_id) THEN
    RAISE EXCEPTION 'Já existe um clã com esse nome';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans
    WHERE upper(tag) = _tag_clean AND id <> _me.clan_id) THEN
    RAISE EXCEPTION 'Já existe um clã com essa sigla';
  END IF;
  UPDATE public.clans
  SET name = _name_clean, motto = _motto, tag = _tag_clean, updated_at = now()
  WHERE id = _me.clan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_clan_recruitment(_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _status NOT IN ('open','selection','closed') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND OR _me.role = 'member' THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  UPDATE public.clans SET recruitment_status = _status, updated_at = now()
  WHERE id = _me.clan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_clan()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _clan record;
  _members jsonb;
  _pending_requests jsonb;
  _unread_mail integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO _clan FROM public.clans WHERE id = _me.clan_id;
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', m.user_id,
      'display_name', COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador'),
      'avatar_url', p.avatar_url,
      'role', m.role,
      'competition_points', m.competition_points,
      'joined_at', m.joined_at
    ) ORDER BY
      CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,
      m.competition_points DESC
  ) INTO _members
  FROM public.clan_members m
  JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.clan_id = _me.clan_id;
  SELECT jsonb_agg(jsonb_build_object(
    'id', r.id, 'user_id', r.user_id,
    'display_name', COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador'),
    'avatar_url', p.avatar_url,
    'created_at', r.created_at
  )) INTO _pending_requests
  FROM public.clan_join_requests r
  JOIN public.profiles p ON p.user_id = r.user_id
  WHERE r.clan_id = _me.clan_id AND r.status = 'pending';
  SELECT COUNT(*) INTO _unread_mail
  FROM public.clan_mail
  WHERE clan_id = _me.clan_id AND is_read = false AND expires_at > now();
  RETURN jsonb_build_object(
    'clan', jsonb_build_object(
      'id', _clan.id, 'name', _clan.name, 'motto', _clan.motto,
      'tag', _clan.tag, 'emblem', _clan.emblem,
      'recruitment_status', _clan.recruitment_status,
      'leader_id', _clan.leader_id,
      'member_count', (SELECT COUNT(*) FROM public.clan_members WHERE clan_id = _clan.id)
    ),
    'my_role', _me.role,
    'members', COALESCE(_members, '[]'::jsonb),
    'pending_requests', COALESCE(_pending_requests, '[]'::jsonb),
    'unread_mail', _unread_mail
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.search_clans(_query text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN (
    SELECT jsonb_agg(row_to_json(r))
    FROM (
      SELECT
        c.id, c.name, c.motto, c.tag, c.emblem, c.recruitment_status,
        (SELECT COUNT(*) FROM public.clan_members m WHERE m.clan_id = c.id)::integer AS member_count,
        COALESCE((SELECT SUM(m.competition_points) FROM public.clan_members m WHERE m.clan_id = c.id), 0)::integer AS competition_points
      FROM public.clans c
      WHERE (_query = '' OR c.name ILIKE '%' || _query || '%' OR c.tag ILIKE '%' || _query || '%')
      ORDER BY competition_points DESC, member_count DESC
      LIMIT 20
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_clan_mail()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não pertences a nenhum clã'; END IF;
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', m.id, 'type', m.type, 'content', m.content,
        'is_read', m.is_read, 'created_at', m.created_at,
        'triggered_by_name', COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador')
      ) ORDER BY m.created_at DESC
    )
    FROM public.clan_mail m
    LEFT JOIN public.profiles p ON p.user_id = m.triggered_by
    WHERE m.clan_id = _me.clan_id AND m.expires_at > now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_clan_mail_read()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.clan_mail SET is_read = true
  WHERE clan_id = _me.clan_id AND is_read = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_clan_message(_body text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
  _msg_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _body := trim(_body);
  IF length(_body) = 0 THEN RAISE EXCEPTION 'Mensagem vazia'; END IF;
  IF length(_body) > 1000 THEN RAISE EXCEPTION 'Mensagem demasiado longa'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não pertences a nenhum clã'; END IF;
  INSERT INTO public.clan_messages (clan_id, sender_id, body)
  VALUES (_me.clan_id, _uid, _body)
  RETURNING id INTO _msg_id;
  RETURN jsonb_build_object('id', _msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_clan_messages()
RETURNS TABLE(
  id uuid, sender_id uuid, body text, created_at timestamptz,
  sender_display_name text, sender_avatar_url text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _me record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _me FROM public.clan_members WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não pertences a nenhum clã'; END IF;
  RETURN QUERY
  SELECT m.id, m.sender_id, m.body, m.created_at,
         COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador'),
         p.avatar_url
  FROM public.clan_messages m
  LEFT JOIN public.profiles p ON p.user_id = m.sender_id
  WHERE m.clan_id = _me.clan_id AND m.deleted_at IS NULL
  ORDER BY m.created_at ASC
  LIMIT 200;
END;
$$;

-- PERMISSIONS
REVOKE EXECUTE ON FUNCTION public.create_clan(text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_clan(text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_clan(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.join_clan(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_clan() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.leave_clan() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.kick_clan_member(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.kick_clan_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_to_officer(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.promote_to_officer(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.demote_to_member(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.demote_to_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_leadership(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.transfer_leadership(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_clan_profile(text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_clan_profile(text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_clan_recruitment(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_clan_recruitment(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_to_join_request(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.respond_to_join_request(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_clan() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_clan() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_clans(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_clans(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_clan_mail() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_clan_mail() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_clan_mail_read() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_clan_mail_read() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.send_clan_message(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.send_clan_message(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_clan_messages() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_clan_messages() TO authenticated;

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_mail;

-- AUTOMATIC CLEANUP
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'cleanup-clan-mail',
  '0 3 * * *',
  $$DELETE FROM public.clan_mail WHERE expires_at < now()$$
);