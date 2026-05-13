
-- =========================================================
-- TABLES
-- =========================================================

CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CHECK (sender_id <> receiver_id)
);
CREATE UNIQUE INDEX uniq_pending_request ON public.friend_requests(sender_id, receiver_id) WHERE status = 'pending';
CREATE INDEX idx_fr_sender ON public.friend_requests(sender_id);
CREATE INDEX idx_fr_receiver_status ON public.friend_requests(receiver_id, status);

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
CREATE INDEX idx_friendships_user ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend ON public.friendships(friend_id);

CREATE TABLE public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX idx_blocks_blocker ON public.user_blocks(blocker_id, blocked_id);
CREATE INDEX idx_blocks_blocked ON public.user_blocks(blocked_id);

CREATE TABLE public.friendship_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL CHECK (action_type IN ('remove_friend','block_user')),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_state jsonb,
  can_undo boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  undone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fa_actor ON public.friendship_actions(actor_id, created_at DESC);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb,
  read_at timestamptz,
  expires_at timestamptz,
  action_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_read ON public.notifications(user_id, read_at);
CREATE INDEX idx_notif_user_created ON public.notifications(user_id, created_at DESC);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_one_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_two_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed','blocked','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_for_user_one_at timestamptz,
  deleted_for_user_two_at timestamptz,
  blocked_at timestamptz,
  CHECK (user_one_id < user_two_id),
  UNIQUE (user_one_id, user_two_id)
);
CREATE INDEX idx_conv_users ON public.conversations(user_one_id, user_two_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at);

-- updated_at triggers
CREATE TRIGGER trg_fr_updated BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_conv_updated BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendship_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- friend_requests: read sender or receiver; writes via RPC
CREATE POLICY "fr_select_own" ON public.friend_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- friendships: read own
CREATE POLICY "fs_select_own" ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- user_blocks: blocker can see; blocked cannot
CREATE POLICY "ub_select_blocker" ON public.user_blocks
  FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

-- friendship_actions: actor only
CREATE POLICY "fa_select_actor" ON public.friendship_actions
  FOR SELECT TO authenticated
  USING (auth.uid() = actor_id);

-- notifications: owner only; allow update for marking read
CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- conversations: participants only
CREATE POLICY "conv_select_participant" ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_one_id OR auth.uid() = user_two_id);

-- messages: participants only
CREATE POLICY "msg_select_participant" ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (auth.uid() = c.user_one_id OR auth.uid() = c.user_two_id)
  ));

-- =========================================================
-- HELPER FUNCTIONS
-- =========================================================

CREATE OR REPLACE FUNCTION public._is_blocked_either(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

CREATE OR REPLACE FUNCTION public._are_friends(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.friendships WHERE user_id = _a AND friend_id = _b);
$$;

-- =========================================================
-- RPCs
-- =========================================================

-- send_friend_request
CREATE OR REPLACE FUNCTION public.send_friend_request(_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _blocker_is_me boolean;
  _blocked_by_them boolean;
  _req_id uuid;
  _target_name text;
  _my_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _uid = _target THEN RAISE EXCEPTION 'Cannot send to self'; END IF;

  IF public._are_friends(_uid, _target) THEN
    RAISE EXCEPTION 'Already friends';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = _uid AND blocked_id = _target) INTO _blocker_is_me;
  SELECT EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = _target AND blocked_id = _uid) INTO _blocked_by_them;

  -- Blocked user cannot contact blocker
  IF _blocked_by_them THEN
    RAISE EXCEPTION 'Cannot send request';
  END IF;

  -- Existing pending?
  IF EXISTS (SELECT 1 FROM public.friend_requests
    WHERE status = 'pending'
      AND ((sender_id = _uid AND receiver_id = _target) OR (sender_id = _target AND receiver_id = _uid))) THEN
    RAISE EXCEPTION 'Pending request already exists';
  END IF;

  INSERT INTO public.friend_requests (sender_id, receiver_id)
  VALUES (_uid, _target)
  RETURNING id INTO _req_id;

  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _my_name FROM public.profiles WHERE user_id = _uid;
  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _target_name FROM public.profiles WHERE user_id = _target;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (_target, 'friend_request', 'Novo pedido de amizade',
    COALESCE(_my_name,'Alguém') || ' enviou-te um pedido de amizade.',
    jsonb_build_object('request_id', _req_id, 'sender_id', _uid));

  RETURN jsonb_build_object('request_id', _req_id, 'reconciliation', _blocker_is_me);
END $$;

-- respond_friend_request
CREATE OR REPLACE FUNCTION public.respond_friend_request(_request_id uuid, _action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _r record;
  _u1 uuid; _u2 uuid;
  _conv_id uuid;
  _accepter_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _action NOT IN ('accept','decline') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  SELECT * INTO _r FROM public.friend_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.receiver_id <> _uid THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _r.status <> 'pending' THEN RAISE EXCEPTION 'Request not pending'; END IF;
  IF _r.expires_at < now() THEN
    UPDATE public.friend_requests SET status='expired' WHERE id=_request_id;
    RAISE EXCEPTION 'Request expired';
  END IF;

  IF _action = 'decline' THEN
    UPDATE public.friend_requests SET status='declined', updated_at=now() WHERE id=_request_id;
    RETURN jsonb_build_object('status','declined');
  END IF;

  -- accept
  UPDATE public.friend_requests SET status='accepted', updated_at=now() WHERE id=_request_id;

  -- If sender had blocked receiver (reconciliation), remove that block
  DELETE FROM public.user_blocks WHERE blocker_id = _r.sender_id AND blocked_id = _r.receiver_id;

  -- Create friendship both sides
  INSERT INTO public.friendships(user_id, friend_id) VALUES (_r.sender_id, _r.receiver_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.friendships(user_id, friend_id) VALUES (_r.receiver_id, _r.sender_id) ON CONFLICT DO NOTHING;

  -- Create or reactivate conversation
  _u1 := LEAST(_r.sender_id, _r.receiver_id);
  _u2 := GREATEST(_r.sender_id, _r.receiver_id);
  INSERT INTO public.conversations(user_one_id, user_two_id, status)
  VALUES (_u1, _u2, 'active')
  ON CONFLICT (user_one_id, user_two_id) DO UPDATE
    SET status='active', blocked_at=NULL, updated_at=now()
  RETURNING id INTO _conv_id;

  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _accepter_name FROM public.profiles WHERE user_id = _uid;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (_r.sender_id, 'friend_request_accepted', 'Pedido aceite',
    COALESCE(_accepter_name,'Alguém') || ' aceitou o teu pedido de amizade.',
    jsonb_build_object('friend_id', _uid));

  RETURN jsonb_build_object('status','accepted','conversation_id',_conv_id);
END $$;

-- remove_friend
CREATE OR REPLACE FUNCTION public.remove_friend(_friend uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _action_id uuid;
  _u1 uuid; _u2 uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public._are_friends(_uid, _friend) THEN RAISE EXCEPTION 'Not friends'; END IF;

  DELETE FROM public.friendships WHERE (user_id=_uid AND friend_id=_friend) OR (user_id=_friend AND friend_id=_uid);

  _u1 := LEAST(_uid,_friend); _u2 := GREATEST(_uid,_friend);
  UPDATE public.conversations SET status='removed', updated_at=now()
  WHERE user_one_id=_u1 AND user_two_id=_u2;

  INSERT INTO public.friendship_actions(action_type, actor_id, target_id, previous_state)
  VALUES ('remove_friend', _uid, _friend, jsonb_build_object('was_friends', true))
  RETURNING id INTO _action_id;

  INSERT INTO public.notifications(user_id, type, title, message, data, expires_at)
  VALUES (_uid, 'friend_removed_undo', 'Amigo removido',
    'Removeste um amigo. Tens 24h para reverter.',
    jsonb_build_object('action_id', _action_id, 'target_id', _friend),
    now() + interval '24 hours');

  RETURN jsonb_build_object('action_id', _action_id);
END $$;

-- undo_remove_friend
CREATE OR REPLACE FUNCTION public.undo_remove_friend(_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _a record;
  _u1 uuid; _u2 uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.friendship_actions WHERE id=_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found'; END IF;
  IF _a.actor_id <> _uid THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _a.action_type <> 'remove_friend' THEN RAISE EXCEPTION 'Wrong action type'; END IF;
  IF _a.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Already undone'; END IF;
  IF _a.expires_at < now() THEN RAISE EXCEPTION 'Action expired'; END IF;
  IF public._is_blocked_either(_uid, _a.target_id) THEN RAISE EXCEPTION 'Block exists'; END IF;

  INSERT INTO public.friendships(user_id, friend_id) VALUES (_uid, _a.target_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.friendships(user_id, friend_id) VALUES (_a.target_id, _uid) ON CONFLICT DO NOTHING;

  _u1 := LEAST(_uid,_a.target_id); _u2 := GREATEST(_uid,_a.target_id);
  UPDATE public.conversations SET status='active', updated_at=now()
  WHERE user_one_id=_u1 AND user_two_id=_u2;

  UPDATE public.friendship_actions SET undone_at=now() WHERE id=_action_id;
  UPDATE public.notifications SET action_used_at=now()
  WHERE user_id=_uid AND (data->>'action_id')::uuid = _action_id;

  RETURN jsonb_build_object('ok', true);
END $$;

-- block_user
CREATE OR REPLACE FUNCTION public.block_user(_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _was_friends boolean;
  _action_id uuid;
  _u1 uuid; _u2 uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _uid = _target THEN RAISE EXCEPTION 'Cannot block self'; END IF;

  _was_friends := public._are_friends(_uid, _target);

  INSERT INTO public.user_blocks(blocker_id, blocked_id) VALUES (_uid, _target) ON CONFLICT DO NOTHING;

  DELETE FROM public.friendships WHERE (user_id=_uid AND friend_id=_target) OR (user_id=_target AND friend_id=_uid);

  UPDATE public.friend_requests SET status='cancelled', updated_at=now()
  WHERE status='pending'
    AND ((sender_id=_uid AND receiver_id=_target) OR (sender_id=_target AND receiver_id=_uid));

  _u1 := LEAST(_uid,_target); _u2 := GREATEST(_uid,_target);
  UPDATE public.conversations SET status='blocked', blocked_at=now(), updated_at=now()
  WHERE user_one_id=_u1 AND user_two_id=_u2;

  INSERT INTO public.friendship_actions(action_type, actor_id, target_id, previous_state)
  VALUES ('block_user', _uid, _target, jsonb_build_object('was_friends', _was_friends))
  RETURNING id INTO _action_id;

  INSERT INTO public.notifications(user_id, type, title, message, data, expires_at)
  VALUES (_uid, 'friend_blocked_undo', 'Utilizador bloqueado',
    'Bloqueaste um utilizador. Tens 24h para reverter.',
    jsonb_build_object('action_id', _action_id, 'target_id', _target),
    now() + interval '24 hours');

  RETURN jsonb_build_object('action_id', _action_id);
END $$;

-- undo_block_user
CREATE OR REPLACE FUNCTION public.undo_block_user(_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _a record;
  _u1 uuid; _u2 uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.friendship_actions WHERE id=_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found'; END IF;
  IF _a.actor_id <> _uid THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _a.action_type <> 'block_user' THEN RAISE EXCEPTION 'Wrong action type'; END IF;
  IF _a.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Already undone'; END IF;
  IF _a.expires_at < now() THEN RAISE EXCEPTION 'Action expired'; END IF;

  DELETE FROM public.user_blocks WHERE blocker_id=_uid AND blocked_id=_a.target_id;

  IF (_a.previous_state->>'was_friends')::boolean THEN
    INSERT INTO public.friendships(user_id, friend_id) VALUES (_uid, _a.target_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.friendships(user_id, friend_id) VALUES (_a.target_id, _uid) ON CONFLICT DO NOTHING;
    _u1 := LEAST(_uid,_a.target_id); _u2 := GREATEST(_uid,_a.target_id);
    UPDATE public.conversations SET status='active', blocked_at=NULL, updated_at=now()
    WHERE user_one_id=_u1 AND user_two_id=_u2;
  END IF;

  UPDATE public.friendship_actions SET undone_at=now() WHERE id=_action_id;
  UPDATE public.notifications SET action_used_at=now()
  WHERE user_id=_uid AND (data->>'action_id')::uuid = _action_id;

  RETURN jsonb_build_object('ok', true);
END $$;

-- unblock_user (without restoring friendship)
CREATE OR REPLACE FUNCTION public.unblock_user(_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.user_blocks WHERE blocker_id=_uid AND blocked_id=_target;
  RETURN jsonb_build_object('ok', true);
END $$;

-- get_friends
CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, total_points integer, best_streak integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.user_id,
    COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador'),
    p.avatar_url,
    COALESCE(p.total_points, 0),
    COALESCE((SELECT MAX(best_streak) FROM public.user_level_stats s WHERE s.user_id = p.user_id), 0)
  FROM public.friendships f
  JOIN public.profiles p ON p.user_id = f.friend_id
  WHERE f.user_id = auth.uid()
  ORDER BY p.total_points DESC NULLS LAST;
$$;

-- search_users
CREATE OR REPLACE FUNCTION public.search_users(_term text)
RETURNS TABLE(
  user_id uuid, display_name text, avatar_url text, total_points integer,
  relation_state text, request_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _term IS NULL OR length(trim(_term)) < 1 THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador') AS display_name,
    p.avatar_url,
    COALESCE(p.total_points, 0),
    CASE
      WHEN EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.blocker_id=_uid AND b.blocked_id=p.user_id) THEN 'blocked_by_me'
      WHEN EXISTS (SELECT 1 FROM public.friendships f WHERE f.user_id=_uid AND f.friend_id=p.user_id) THEN 'friends'
      WHEN EXISTS (SELECT 1 FROM public.friend_requests r WHERE r.status='pending' AND r.sender_id=_uid AND r.receiver_id=p.user_id) THEN 'request_sent'
      WHEN EXISTS (SELECT 1 FROM public.friend_requests r WHERE r.status='pending' AND r.sender_id=p.user_id AND r.receiver_id=_uid) THEN 'request_received'
      ELSE 'none'
    END AS relation_state,
    (SELECT r.id FROM public.friend_requests r
      WHERE r.status='pending'
        AND ((r.sender_id=_uid AND r.receiver_id=p.user_id) OR (r.sender_id=p.user_id AND r.receiver_id=_uid))
      LIMIT 1) AS request_id
  FROM public.profiles p
  WHERE p.user_id <> _uid
    AND (p.display_name ILIKE '%'||_term||'%' OR p.username ILIKE '%'||_term||'%')
    -- exclude users who blocked me
    AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.blocker_id=p.user_id AND b.blocked_id=_uid)
  ORDER BY COALESCE(p.total_points,0) DESC
  LIMIT 50;
END $$;

-- get_mailbox
CREATE OR REPLACE FUNCTION public.get_mailbox()
RETURNS SETOF public.notifications
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.notifications
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 100;
$$;

-- mark_notification_read
CREATE OR REPLACE FUNCTION public.mark_notification_read(_notification_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications SET read_at = COALESCE(read_at, now())
  WHERE id = _notification_id AND user_id = auth.uid();
$$;

-- get_blocked_users
CREATE OR REPLACE FUNCTION public.get_blocked_users()
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, blocked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.blocked_id, COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador'), p.avatar_url, b.created_at
  FROM public.user_blocks b
  JOIN public.profiles p ON p.user_id = b.blocked_id
  WHERE b.blocker_id = auth.uid()
  ORDER BY b.created_at DESC;
$$;

-- get_or_create_conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_friend uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _u1 uuid; _u2 uuid;
  _conv record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public._are_friends(_uid, _friend) THEN RAISE EXCEPTION 'Not friends'; END IF;
  IF public._is_blocked_either(_uid, _friend) THEN RAISE EXCEPTION 'Blocked'; END IF;

  _u1 := LEAST(_uid,_friend); _u2 := GREATEST(_uid,_friend);
  INSERT INTO public.conversations(user_one_id, user_two_id, status)
  VALUES (_u1,_u2,'active')
  ON CONFLICT (user_one_id, user_two_id) DO UPDATE SET updated_at=now()
  RETURNING * INTO _conv;

  RETURN jsonb_build_object('id', _conv.id, 'status', _conv.status);
END $$;

-- send_message
CREATE OR REPLACE FUNCTION public.send_message(_conversation_id uuid, _body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _c record;
  _other uuid;
  _msg_id uuid;
  _sender_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _body := trim(_body);
  IF _body IS NULL OR length(_body) = 0 THEN RAISE EXCEPTION 'Empty message'; END IF;
  IF length(_body) > 1000 THEN RAISE EXCEPTION 'Message too long'; END IF;

  SELECT * INTO _c FROM public.conversations WHERE id=_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF _uid <> _c.user_one_id AND _uid <> _c.user_two_id THEN RAISE EXCEPTION 'Not a participant'; END IF;
  IF _c.status <> 'active' THEN RAISE EXCEPTION 'Conversation not active'; END IF;

  _other := CASE WHEN _uid = _c.user_one_id THEN _c.user_two_id ELSE _c.user_one_id END;
  IF NOT public._are_friends(_uid, _other) THEN RAISE EXCEPTION 'Not friends anymore'; END IF;
  IF public._is_blocked_either(_uid, _other) THEN RAISE EXCEPTION 'Blocked'; END IF;

  INSERT INTO public.messages(conversation_id, sender_id, body)
  VALUES (_conversation_id, _uid, _body) RETURNING id INTO _msg_id;

  UPDATE public.conversations SET updated_at=now() WHERE id=_conversation_id;

  SELECT COALESCE(NULLIF(display_name,''), username, 'Utilizador') INTO _sender_name FROM public.profiles WHERE user_id=_uid;

  INSERT INTO public.notifications(user_id, type, title, message, data)
  VALUES (_other, 'new_message', 'Nova mensagem',
    COALESCE(_sender_name,'Alguém') || ' enviou-te uma mensagem.',
    jsonb_build_object('conversation_id', _conversation_id, 'sender_id', _uid));

  RETURN jsonb_build_object('id', _msg_id);
END $$;

-- get_conversation_messages
CREATE OR REPLACE FUNCTION public.get_conversation_messages(_conversation_id uuid)
RETURNS SETOF public.messages
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=_conversation_id AND (c.user_one_id=_uid OR c.user_two_id=_uid)) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  RETURN QUERY SELECT * FROM public.messages WHERE conversation_id=_conversation_id AND deleted_at IS NULL ORDER BY created_at ASC;
END $$;

-- list_conversations
CREATE OR REPLACE FUNCTION public.list_conversations()
RETURNS TABLE(
  conversation_id uuid, friend_id uuid, friend_name text, avatar_url text,
  status text, last_message text, last_message_at timestamptz, unread_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid)
  SELECT
    c.id,
    CASE WHEN c.user_one_id = (SELECT uid FROM me) THEN c.user_two_id ELSE c.user_one_id END AS friend_id,
    COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador'),
    p.avatar_url,
    c.status,
    (SELECT body FROM public.messages m WHERE m.conversation_id=c.id ORDER BY created_at DESC LIMIT 1),
    (SELECT created_at FROM public.messages m WHERE m.conversation_id=c.id ORDER BY created_at DESC LIMIT 1),
    (SELECT COUNT(*)::int FROM public.messages m
      WHERE m.conversation_id=c.id AND m.sender_id <> (SELECT uid FROM me) AND m.read_at IS NULL)
  FROM public.conversations c
  JOIN public.profiles p ON p.user_id = (CASE WHEN c.user_one_id = auth.uid() THEN c.user_two_id ELSE c.user_one_id END)
  WHERE (c.user_one_id = auth.uid() OR c.user_two_id = auth.uid())
    AND c.status IN ('active','removed')
  ORDER BY c.updated_at DESC;
$$;

-- mark_conversation_read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.messages SET read_at = COALESCE(read_at, now())
  WHERE conversation_id = _conversation_id
    AND sender_id <> auth.uid()
    AND read_at IS NULL
    AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=_conversation_id AND (c.user_one_id=auth.uid() OR c.user_two_id=auth.uid()));
$$;

-- =========================================================
-- get_leaderboard: hide blocked users (both directions)
-- =========================================================
DROP FUNCTION IF EXISTS public.get_leaderboard(integer, integer);

CREATE OR REPLACE FUNCTION public.get_leaderboard(_level integer, _limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, points integer, best_streak integer, correct_answers integer, total_answers integer, rank bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ranked AS (
    SELECT
      s.user_id,
      COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador') AS display_name,
      p.avatar_url,
      s.points,
      s.best_streak,
      s.correct_answers,
      s.total_answers,
      RANK() OVER (
        ORDER BY s.points DESC, s.best_streak DESC,
        CASE WHEN s.total_answers > 0 THEN s.correct_answers::numeric / s.total_answers ELSE 0 END DESC
      ) AS rank
    FROM public.user_level_stats s
    JOIN public.profiles p ON p.user_id = s.user_id
    WHERE s.level = _level
      AND p.show_on_leaderboard = true
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_id = auth.uid() AND b.blocked_id = s.user_id)
           OR (b.blocker_id = s.user_id AND b.blocked_id = auth.uid())
      )
  )
  (SELECT * FROM ranked WHERE rank <= _limit)
  UNION
  (SELECT * FROM ranked WHERE user_id = auth.uid())
  ORDER BY rank;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.send_friend_request(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_friend_request(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_friend(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.undo_remove_friend(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.undo_remove_friend(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.block_user(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.undo_block_user(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.undo_block_user(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.unblock_user(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_friends() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_friends() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_users(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_mailbox() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_mailbox() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_blocked_users() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_blocked_users() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.send_message(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_conversation_messages(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_conversations() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_conversations() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
