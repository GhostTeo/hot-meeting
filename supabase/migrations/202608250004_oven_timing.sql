-- L'attesa vera, quella promessa al cliente.
--
-- Fino a qui ogni ordine riceveva «pronto fra 10 minuti», sempre, anche con
-- trenta pizze in coda. Una promessa che la cucina non poteva mantenere.
--
-- Le pizze non escono a una a una, escono a infornate: nel forno ce ne stanno
-- sei e ogni infornata dura quattro minuti dalla stesura alla consegna, cioe'
-- circa novanta pizze all'ora. Un ordine e' pronto quando esce l'infornata che
-- contiene la sua ultima pizza. Il margine finale copre cio' che non sta nel
-- forno: incartare, chiamare, consegnare al banco.
--
-- Le bibite non occupano il forno e non allungano niente.
--
-- Il calcolo sta in un trigger sulle righe dell'ordine invece che dentro le due
-- funzioni di creazione: cosi' vale sia per gli ordini dal sito sia per quelli
-- presi al telefono, senza ripetere la stessa formula in due posti dove
-- potrebbero divergere.

alter table public.services
  add column if not exists oven_slots integer not null default 6,
  add column if not exists bake_minutes integer not null default 4,
  add column if not exists handover_minutes integer not null default 5;

alter table public.services drop constraint if exists services_oven_slots_check;
alter table public.services add constraint services_oven_slots_check
  check (oven_slots between 1 and 40);
alter table public.services drop constraint if exists services_bake_minutes_check;
alter table public.services add constraint services_bake_minutes_check
  check (bake_minutes between 1 and 60);
alter table public.services drop constraint if exists services_handover_minutes_check;
alter table public.services add constraint services_handover_minutes_check
  check (handover_minutes between 0 and 60);

create or replace function public.order_ready_minutes(p_order_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_service public.services%rowtype;
  v_ahead integer;
  v_mine integer;
begin
  select service.* into v_service
    from public.services service
    join public.orders ordine on ordine.service_id = service.id
   where ordine.id = p_order_id;
  if not found then
    return null;
  end if;

  -- Le mie pizze, quelle della revisione corrente.
  select coalesce(sum(item.quantity), 0) into v_mine
    from public.order_items item
    join public.products product on product.id = item.product_id
   where item.order_id = p_order_id
     and item.revision = (select max(revision) from public.order_items where order_id = p_order_id)
     and product.product_type = 'pizza';

  -- Le pizze davanti: solo gli ordini ancora in preparazione dello stesso turno.
  select coalesce(sum(item.quantity), 0) into v_ahead
    from public.order_items item
    join public.products product on product.id = item.product_id
    join public.orders ordine on ordine.id = item.order_id
   where ordine.service_id = v_service.id
     and ordine.id <> p_order_id
     and ordine.status = 'preparing'
     and item.revision = (select max(revision) from public.order_items where order_id = ordine.id)
     and product.product_type = 'pizza';

  return ceil((v_ahead + v_mine)::numeric / greatest(1, v_service.oven_slots))::integer
       * greatest(1, v_service.bake_minutes)
       + greatest(0, v_service.handover_minutes);
end;
$$;

create or replace function public.apply_order_eta()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_minutes integer;
begin
  -- Solo alla nascita dell'ordine: una revisione successiva non deve spostare
  -- un orario gia' promesso a chi sta aspettando.
  if new.revision <> 1 then
    return null;
  end if;

  v_minutes := public.order_ready_minutes(new.order_id);
  if v_minutes is null then
    return null;
  end if;

  update public.orders
     set eta_ready_at = created_at + make_interval(mins => v_minutes)
   where id = new.order_id
     and eta_ready_at is distinct from created_at + make_interval(mins => v_minutes);
  return null;
end;
$$;

drop trigger if exists order_items_apply_eta on public.order_items;
create trigger order_items_apply_eta
after insert on public.order_items
for each row execute function public.apply_order_eta();

-- Il forno si regola: se cambiano teglia o tempi, cambia l'attesa promessa.
create or replace function public.set_service_oven(
  p_service_id uuid,
  p_oven_slots integer,
  p_bake_minutes integer,
  p_handover_minutes integer
)
returns public.services
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_service public.services%rowtype;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;
  if p_oven_slots not between 1 and 40
     or p_bake_minutes not between 1 and 60
     or p_handover_minutes not between 0 and 60 then
    raise exception 'oven settings out of range' using errcode = '22023';
  end if;

  update public.services set
    oven_slots = p_oven_slots,
    bake_minutes = p_bake_minutes,
    handover_minutes = p_handover_minutes,
    capacity_pizzas_hour = greatest(1, least(1000, (60 / p_bake_minutes) * p_oven_slots))
   where id = p_service_id
   returning * into v_service;
  if not found then
    raise exception 'service not found' using errcode = '22023';
  end if;

  insert into public.events (actor_id, actor_kind, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'creator', 'service.oven-updated', 'service', p_service_id,
    jsonb_build_object('oven_slots', p_oven_slots, 'bake_minutes', p_bake_minutes,
                       'handover_minutes', p_handover_minutes)
  );
  return v_service;
end;
$$;

revoke all on function public.set_service_oven(uuid, integer, integer, integer) from public;
grant execute on function public.set_service_oven(uuid, integer, integer, integer) to authenticated;

-- Le impostazioni del forno servono anche a chi guarda il menu senza essere
-- collegato: e' con quelle che si calcola l'attesa mostrata prima di ordinare.
-- Stessa vista di prima, filtro e barriera immutati: cambiano solo le tre
-- colonne del forno, che servono a calcolare l'attesa mostrata prima di
-- ordinare anche a chi non e' collegato.
drop view if exists public.public_opening_status;
create view public.public_opening_status with (security_barrier = true) as
select
  service.id as service_id,
  day.business_date,
  service.shift,
  service.status,
  service.online_orders_enabled,
  service.oven_slots,
  service.bake_minutes,
  service.handover_minutes,
  service.opened_at,
  service.closed_at
from public.services service
join public.business_days day on day.id = service.business_day_id
where day.status = 'open';

revoke all on table public.public_opening_status from public, anon, authenticated;
grant select on table public.public_opening_status to anon, authenticated;
