-- Il calendario (riposo settimanale, ferie, aperture straordinarie) viene
-- modificato dal Creator e deve raggiungere subito gli altri dispositivi,
-- esattamente come menu, servizi e ordini. Senza questa riga la tabella non
-- entra nel publication Realtime e una chiusura impostata sulla cassa non
-- comparirebbe sul telefono finche' non si ricarica la pagina.
--
-- Il blocco e' idempotente: puo' essere riapplicato senza effetti.

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'closures'
    ) then
      alter publication supabase_realtime add table public.closures;
    end if;
  end if;
end;
$$;
