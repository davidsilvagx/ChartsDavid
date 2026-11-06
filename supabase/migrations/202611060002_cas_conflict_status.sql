-- Supabase/PostgREST 14 can loop forever when an RPC raises SQLSTATE 40001.
-- A business revision mismatch must return HTTP 409, not serialization_failure.
-- https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.lastchart_commit_snapshot(bigint,text,text)'::regprocedure) INTO definition;
  EXECUTE replace(definition, '''40001''', '''PT409''');
END $$;
