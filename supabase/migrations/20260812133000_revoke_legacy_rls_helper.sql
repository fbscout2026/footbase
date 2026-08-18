begin;

-- Live-project legacy helper: it is administrative and must not be exposed as RPC.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;
