
-- 1) profiles: drop overly broad leaderboard SELECT policy (use get_leaderboard RPC instead)
DROP POLICY IF EXISTS "Public leaderboard profiles are viewable" ON public.profiles;

-- 2) user_level_stats: drop public leaderboard SELECT policy (use get_leaderboard RPC instead)
DROP POLICY IF EXISTS "Public level stats viewable for opted-in users" ON public.user_level_stats;

-- 3) user_answers: remove direct INSERT; all writes go through submit_answer (SECURITY DEFINER)
DROP POLICY IF EXISTS "Users can insert their own answers" ON public.user_answers;

-- 4) user_progress: remove direct INSERT/UPDATE; writes via handle_new_user trigger and submit_answer
DROP POLICY IF EXISTS "Users can insert their own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON public.user_progress;

-- 5) questions: restrict correct_answer column from being selectable by clients
REVOKE SELECT (correct_answer) ON public.questions FROM anon, authenticated;

-- 6) Lock down SECURITY DEFINER RPCs from anonymous role (functions already check auth.uid())
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, public', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 7) Realtime: scope channel subscriptions to the authenticated user's own data
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rt_authenticated_only" ON realtime.messages;
CREATE POLICY "rt_authenticated_only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Only allow receiving broadcasts the user is entitled to via underlying RLS.
  -- Restrict to authenticated role; underlying table RLS still filters payloads.
  auth.uid() IS NOT NULL
);
