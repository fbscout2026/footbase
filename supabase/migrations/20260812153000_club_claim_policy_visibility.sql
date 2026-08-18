begin;

-- WITH CHECK may observe either the pre-trigger or post-trigger club state.
-- The SECURITY DEFINER BEFORE trigger remains authoritative: it locks the row
-- and only transitions an actually unclaimed club to pending.
drop policy if exists reivindicacao_insert_own on public.solicitacoes_reivindicacao;
create policy reivindicacao_insert_own on public.solicitacoes_reivindicacao
  for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and (
      (
        tipo = 'clube'
        and bid_atleta is null
        and clube_id is not null
        and exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'club'
            and p.account_status = 'approved'
        )
        and exists (
          select 1 from public.clubes c
          where c.id = solicitacoes_reivindicacao.clube_id
            and c.claim_status in ('unclaimed', 'pending')
        )
        and not exists (
          select 1 from public.clubes c
          where c.reivindicado_por = (select auth.uid())
        )
      )
      or (
        tipo = 'atleta'
        and bid_atleta is not null
        and clube_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'agent'
            and p.account_status = 'approved'
        )
      )
    )
  );

commit;
