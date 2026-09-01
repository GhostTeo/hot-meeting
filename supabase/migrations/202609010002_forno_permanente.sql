-- Il forno e' una proprieta' fissa della pizzeria, non del singolo servizio.
--
-- Prima i numeri del forno (quante pizze, quanti minuti) vivevano sul servizio
-- aperto: si potevano cambiare solo a servizio aperto, e alla riapertura
-- tornavano ai valori di partenza. Cosi' sembrava «non mi fa modificare».
--
-- Ora vivono in un'unica riga di impostazioni, si cambiano sempre, e ogni nuovo
-- servizio li eredita.

create table if not exists public.pizzeria_settings (
  id integer primary key default 1 check (id = 1),
  oven_slots integer not null default 6 check (oven_slots between 1 and 40),
  bake_minutes integer not null default 4 check (bake_minutes between 1 and 60),
  handover_minutes integer not null default 5 check (handover_minutes between 0 and 60),
  updated_at timestamptz not null default now()
);

insert into public.pizzeria_settings (id) values (1) on conflict (id) do nothing;

alter table public.pizzeria_settings enable row level security;

-- Le impostazioni del forno servono anche al cliente non collegato per calcolare
-- l'attesa: si leggono da tutti, si cambiano solo dal Creator.
drop policy if exists "settings_public_read" on public.pizzeria_settings;
create policy "settings_public_read" on public.pizzeria_settings
  for select to anon, authenticated using (true);

drop policy if exists "settings_creator_write" on public.pizzeria_settings;
create policy "settings_creator_write" on public.pizzeria_settings
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

-- Un servizio nuovo eredita il forno dalle impostazioni: chi apre non deve
-- reimpostarlo ogni volta.
create or replace function public.inherit_oven_defaults()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v public.pizzeria_settings%rowtype;
begin
  select * into v from public.pizzeria_settings where id = 1;
  if found then
    new.oven_slots := v.oven_slots;
    new.bake_minutes := v.bake_minutes;
    new.handover_minutes := v.handover_minutes;
    new.capacity_pizzas_hour := greatest(1, least(1000, (60 / v.bake_minutes) * v.oven_slots));
  end if;
  return new;
end;
$$;

drop trigger if exists services_inherit_oven on public.services;
create trigger services_inherit_oven
before insert on public.services
for each row execute function public.inherit_oven_defaults();

-- Cambia il forno una volta per tutte: aggiorna le impostazioni e, se c'e' un
-- servizio aperto, anche quello, cosi' l'effetto e' immediato.
create or replace function public.set_oven_defaults(p_slots integer, p_bake integer, p_handover integer)
returns public.pizzeria_settings
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v public.pizzeria_settings%rowtype;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;
  if p_slots not between 1 and 40 or p_bake not between 1 and 60 or p_handover not between 0 and 60 then
    raise exception 'oven settings out of range' using errcode = '22023';
  end if;

  insert into public.pizzeria_settings (id, oven_slots, bake_minutes, handover_minutes, updated_at)
  values (1, p_slots, p_bake, p_handover, now())
  on conflict (id) do update set
    oven_slots = excluded.oven_slots,
    bake_minutes = excluded.bake_minutes,
    handover_minutes = excluded.handover_minutes,
    updated_at = now()
  returning * into v;

  update public.services set
    oven_slots = p_slots, bake_minutes = p_bake, handover_minutes = p_handover,
    capacity_pizzas_hour = greatest(1, least(1000, (60 / p_bake) * p_slots))
   where status = 'open';

  insert into public.events (actor_id, actor_kind, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'creator', 'oven.defaults-updated', 'settings', null,
          jsonb_build_object('oven_slots', p_slots, 'bake_minutes', p_bake, 'handover_minutes', p_handover));
  return v;
end;
$$;

revoke all on function public.set_oven_defaults(integer, integer, integer) from public, anon;
grant execute on function public.set_oven_defaults(integer, integer, integer) to authenticated;

alter publication supabase_realtime add table public.pizzeria_settings;
