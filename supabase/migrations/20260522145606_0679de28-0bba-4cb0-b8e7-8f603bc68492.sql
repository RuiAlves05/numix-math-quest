
-- ============ NOTIFICATIONS: soft delete + RPCs ============
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_mailbox()
RETURNS SETOF public.notifications
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT * FROM public.notifications
  WHERE user_id = auth.uid()
    AND deleted_at IS NULL
    AND type <> 'friend_request'
  ORDER BY created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.notifications SET read_at = COALESCE(read_at, now())
  WHERE user_id = auth.uid() AND read_at IS NULL AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.delete_notification(_notification_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.notifications SET deleted_at = now()
  WHERE id = _notification_id AND user_id = auth.uid() AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.delete_all_notifications()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.notifications SET deleted_at = now()
  WHERE user_id = auth.uid() AND deleted_at IS NULL;
$$;

-- ============ FRIEND REQUESTS: list + cancel ============
CREATE OR REPLACE FUNCTION public.list_friend_requests()
RETURNS TABLE(
  id uuid, direction text, other_user_id uuid, display_name text, avatar_url text,
  status text, created_at timestamptz, expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    r.id,
    CASE WHEN r.sender_id = auth.uid() THEN 'sent' ELSE 'received' END,
    CASE WHEN r.sender_id = auth.uid() THEN r.receiver_id ELSE r.sender_id END,
    COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador'),
    p.avatar_url,
    r.status, r.created_at, r.expires_at
  FROM public.friend_requests r
  JOIN public.profiles p ON p.user_id = CASE WHEN r.sender_id = auth.uid() THEN r.receiver_id ELSE r.sender_id END
  WHERE r.status = 'pending'
    AND (r.sender_id = auth.uid() OR r.receiver_id = auth.uid())
  ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _r record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _r FROM public.friend_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.sender_id <> _uid THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _r.status <> 'pending' THEN RAISE EXCEPTION 'Not pending'; END IF;
  UPDATE public.friend_requests SET status='cancelled', updated_at=now() WHERE id=_request_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Avoid creating friend_request notifications going forward
CREATE OR REPLACE FUNCTION public.send_friend_request(_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _blocker_is_me boolean; _blocked_by_them boolean;
  _req_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _uid = _target THEN RAISE EXCEPTION 'Cannot send to self'; END IF;
  IF public._are_friends(_uid, _target) THEN RAISE EXCEPTION 'Already friends'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = _uid AND blocked_id = _target) INTO _blocker_is_me;
  SELECT EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = _target AND blocked_id = _uid) INTO _blocked_by_them;
  IF _blocked_by_them THEN RAISE EXCEPTION 'Cannot send request'; END IF;
  IF EXISTS (SELECT 1 FROM public.friend_requests
    WHERE status = 'pending'
      AND ((sender_id = _uid AND receiver_id = _target) OR (sender_id = _target AND receiver_id = _uid))) THEN
    RAISE EXCEPTION 'Pending request already exists';
  END IF;
  INSERT INTO public.friend_requests (sender_id, receiver_id) VALUES (_uid, _target) RETURNING id INTO _req_id;
  RETURN jsonb_build_object('request_id', _req_id, 'reconciliation', _blocker_is_me);
END $$;

-- ============ CHAT: messages with sender profile ============
CREATE OR REPLACE FUNCTION public.get_conversation_messages_with_profiles(_conversation_id uuid)
RETURNS TABLE(
  id uuid, conversation_id uuid, sender_id uuid, body text, created_at timestamptz, read_at timestamptz,
  sender_display_name text, sender_avatar_url text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=_conversation_id AND (c.user_one_id=_uid OR c.user_two_id=_uid)) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  RETURN QUERY
  SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at, m.read_at,
         COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador'), p.avatar_url
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.user_id = m.sender_id
  WHERE m.conversation_id = _conversation_id AND m.deleted_at IS NULL
  ORDER BY m.created_at ASC;
END $$;

-- ============ TUTOR ERROR MEMORY ============
CREATE TABLE IF NOT EXISTS public.tutor_error_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  error_type text NOT NULL,
  error_category text,
  level integer,
  topic text,
  occurrence_count integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tutor_error_memory_unique
  ON public.tutor_error_memory (user_id, error_type, COALESCE(level,-1), COALESCE(topic,''));

ALTER TABLE public.tutor_error_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tem_select_own" ON public.tutor_error_memory;
CREATE POLICY "tem_select_own" ON public.tutor_error_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tem_update_own" ON public.tutor_error_memory;
CREATE POLICY "tem_update_own" ON public.tutor_error_memory
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_tutor_error_memory()
RETURNS SETOF public.tutor_error_memory
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public.tutor_error_memory
  WHERE user_id = auth.uid() AND is_active = true
  ORDER BY occurrence_count DESC, last_seen_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.clear_tutor_error(_memory_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.tutor_error_memory
  SET is_active = false, cleared_at = now(), updated_at = now()
  WHERE id = _memory_id AND user_id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.clear_tutor_error_by_type(_error_type text, _level integer DEFAULT NULL, _topic text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.tutor_error_memory
  SET is_active = false, cleared_at = now(), updated_at = now()
  WHERE user_id = auth.uid() AND is_active = true
    AND error_type = _error_type
    AND (_level IS NULL OR level = _level)
    AND (_topic IS NULL OR topic = _topic);
$$;

CREATE OR REPLACE FUNCTION public.clear_all_tutor_memory()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.tutor_error_memory
  SET is_active = false, cleared_at = now(), updated_at = now()
  WHERE user_id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.upsert_tutor_error_memory(
  _user_id uuid, _error_type text, _level integer, _topic text, _category text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.tutor_error_memory
  WHERE user_id = _user_id
    AND error_type = _error_type
    AND COALESCE(level,-1) = COALESCE(_level,-1)
    AND COALESCE(topic,'') = COALESCE(_topic,'')
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.tutor_error_memory(user_id, error_type, error_category, level, topic, occurrence_count)
    VALUES (_user_id, _error_type, _category, _level, _topic, 1);
  ELSIF _row.is_active THEN
    UPDATE public.tutor_error_memory
    SET occurrence_count = _row.occurrence_count + 1, last_seen_at = now(), updated_at = now()
    WHERE id = _row.id;
  ELSE
    -- reactivate fresh, count=1
    UPDATE public.tutor_error_memory
    SET is_active = true, cleared_at = NULL, occurrence_count = 1,
        last_seen_at = now(), updated_at = now(), error_category = COALESCE(_category, error_category)
    WHERE id = _row.id;
  END IF;
END $$;

-- ============ SUBMIT_ANSWER updated: returns explanation + writes tutor memory ============
CREATE OR REPLACE FUNCTION public.submit_answer(_question_id uuid, _user_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _q record;
  _is_correct boolean;
  _stats record;
  _new_streak integer;
  _multiplier numeric;
  _base_points integer;
  _points_earned integer;
  _best_streak integer;
  _topic text;
  _error_type text;
  _explanation text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _q FROM public.questions WHERE id = _question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;

  _is_correct := (_user_answer = _q.correct_answer);
  _base_points := COALESCE(_q.points, 10);
  _topic := COALESCE(NULLIF(_q.topic,''), _q.category);
  _explanation := _q.explanation;

  INSERT INTO public.user_level_stats (user_id, level) VALUES (_uid, _q.difficulty_level)
  ON CONFLICT (user_id, level) DO NOTHING;
  SELECT * INTO _stats FROM public.user_level_stats WHERE user_id = _uid AND level = _q.difficulty_level;

  IF _is_correct THEN _new_streak := _stats.current_streak + 1; ELSE _new_streak := 0; END IF;
  _multiplier := CASE
    WHEN _new_streak >= 20 THEN 2.0 WHEN _new_streak >= 15 THEN 1.8
    WHEN _new_streak >= 10 THEN 1.5 WHEN _new_streak >= 5 THEN 1.3 ELSE 1.0 END;

  IF _is_correct THEN _points_earned := ROUND(_base_points * _multiplier)::int;
  ELSE _points_earned := 0; _multiplier := 1.0; END IF;
  _best_streak := GREATEST(_stats.best_streak, _new_streak);

  UPDATE public.user_level_stats
  SET points = points + _points_earned,
      correct_answers = correct_answers + (CASE WHEN _is_correct THEN 1 ELSE 0 END),
      total_answers = total_answers + 1,
      current_streak = _new_streak,
      best_streak = _best_streak,
      updated_at = now()
  WHERE user_id = _uid AND level = _q.difficulty_level;

  UPDATE public.profiles
  SET total_points = COALESCE(total_points,0) + _points_earned,
      level = GREATEST(COALESCE(level,1), _q.difficulty_level), updated_at = now()
  WHERE user_id = _uid;

  UPDATE public.user_progress
  SET questions_completed = COALESCE(questions_completed,0) + (CASE WHEN _is_correct THEN 1 ELSE 0 END),
      current_level = GREATEST(COALESCE(current_level,1), _q.difficulty_level),
      last_activity_date = CURRENT_DATE, updated_at = now()
  WHERE user_id = _uid;

  INSERT INTO public.user_answers (
    user_id, question_id, user_answer, is_correct, points_earned,
    level, base_points, multiplier, streak_after_answer
  ) VALUES (
    _uid, _question_id, _user_answer, _is_correct, _points_earned,
    _q.difficulty_level, _base_points, _multiplier, _new_streak
  );

  -- Update tutor memory only on wrong answer
  IF NOT _is_correct THEN
    _error_type := CASE
      WHEN _topic ILIKE '%cont%' OR _topic ILIKE '%count%' THEN 'counting'
      WHEN _topic ILIKE '%adi%' OR _topic ILIKE '%soma%' OR _topic ILIKE '%add%' THEN 'addition'
      WHEN _topic ILIKE '%subt%' OR _topic ILIKE '%menos%' THEN 'subtraction'
      WHEN _topic ILIKE '%multip%' OR _topic ILIKE '%tabuada%' THEN 'multiplication'
      WHEN _topic ILIKE '%divis%' THEN 'division'
      WHEN _topic ILIKE '%fra%' OR _topic ILIKE '%fract%' THEN 'fractions'
      WHEN _topic ILIKE '%geo%' OR _topic ILIKE '%forma%' OR _topic ILIKE '%per%metro%' OR _topic ILIKE '%area%' THEN 'geometry'
      WHEN _topic ILIKE '%medid%' OR _topic ILIKE '%conver%' THEN 'measurement'
      WHEN _topic ILIKE '%problem%' THEN 'word_problem'
      WHEN _topic ILIKE '%tempo%' OR _topic ILIKE '%hora%' OR _topic ILIKE '%calend%' THEN 'time'
      WHEN _topic ILIKE '%dinheiro%' OR _topic ILIKE '%money%' THEN 'money'
      WHEN _topic ILIKE '%padr%' OR _topic ILIKE '%sequ%' THEN 'patterns'
      WHEN _topic ILIKE '%decim%' THEN 'decimals'
      WHEN _topic ILIKE '%compar%' THEN 'comparison'
      ELSE COALESCE(_topic, 'general')
    END;

    PERFORM public.upsert_tutor_error_memory(_uid, _error_type, _q.difficulty_level, _topic, _q.category);
  END IF;

  RETURN jsonb_build_object(
    'correct', _is_correct,
    'correct_answer', _q.correct_answer,
    'explanation', _explanation,
    'points_earned', _points_earned,
    'base_points', _base_points,
    'multiplier', _multiplier,
    'current_streak', _new_streak,
    'best_streak', _best_streak,
    'level', _q.difficulty_level,
    'total_level_points', _stats.points + _points_earned,
    'topic', _topic
  );
END $$;
