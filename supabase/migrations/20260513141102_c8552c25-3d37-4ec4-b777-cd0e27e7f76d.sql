-- Prevent clients from reading the correct_answer column
REVOKE SELECT (correct_answer) ON public.questions FROM anon, authenticated;

-- Restrict SECURITY DEFINER functions to authenticated users only
REVOKE EXECUTE ON FUNCTION public.submit_answer(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_answer(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard(integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer, integer) TO authenticated;