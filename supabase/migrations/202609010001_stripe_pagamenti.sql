-- Tenere traccia del pagamento online, senza toccare i soldi.
--
-- Il denaro lo muove Stripe, non il database: qui si scrive soltanto se un
-- ordine e' stato pagato online, quando, e con quale sessione di Stripe. Serve a
-- due cose: non far ripartire in cucina un ordine che il cliente sta ancora
-- pagando, e ritrovare l'incasso nei conti di fine giornata.
--
-- Chi segna «pagato» e' soltanto Stripe, attraverso una funzione che verifica
-- la firma del messaggio: nessun cliente, nemmeno collegato, puo' dichiararsi
-- pagato per conto suo.

alter table public.orders
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'awaiting', 'paid')),
  add column if not exists stripe_session_id text,
  add column if not exists paid_at timestamptz;

-- La sessione di Stripe e' unica per ordine: se lo stesso messaggio arriva due
-- volte (Stripe li ripete finche' non rispondi ok) non si incassa due volte.
create unique index if not exists orders_stripe_session_idx
  on public.orders (stripe_session_id) where stripe_session_id is not null;

-- Segna un ordine «in attesa di pagamento» e gli attacca la sessione di Stripe.
-- La chiama la funzione che apre il pagamento, con la chiave segreta del
-- servizio: dal browser non si arriva.
create or replace function public.attach_checkout_session(p_order_id uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.orders
     set stripe_session_id = p_session_id,
         payment_status = case when payment_status = 'paid' then 'paid' else 'awaiting' end
   where id = p_order_id;
end;
$$;

-- Segna un ordine «pagato». La chiama solo il webhook di Stripe, dopo aver
-- verificato la firma: e' l'unico punto in cui payment_status diventa 'paid'.
create or replace function public.mark_order_paid(p_session_id text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_order_id uuid;
begin
  update public.orders
     set payment_status = 'paid',
         paid_at = coalesce(paid_at, now())
   where stripe_session_id = p_session_id
     and payment_status <> 'paid'
   returning id into v_order_id;

  if v_order_id is not null then
    insert into public.events (actor_kind, action, entity_type, entity_id, metadata)
    values ('system', 'order.paid-online', 'order', v_order_id,
            jsonb_build_object('stripe_session_id', p_session_id));
  end if;

  return v_order_id;
end;
$$;

-- Queste due funzioni girano solo dal server (chiave service_role dentro le
-- Edge Function). Dal browser, con la chiave pubblica, restano irraggiungibili.
revoke all on function public.attach_checkout_session(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_order_paid(text) from public, anon, authenticated;

-- La coda pubblica non conta gli ordini ancora in attesa di pagamento online:
-- non sono nel forno e forse non ci entreranno. Ricreata qui perche' dipende
-- dalla colonna payment_status appena aggiunta.
drop view if exists public.public_queue_status;
create view public.public_queue_status with (security_barrier = true) as
select
  service.id as service_id,
  coalesce(sum(item.quantity) filter (where product.product_type = 'pizza'), 0)::integer as pizzas_queued
from public.services service
join public.business_days day on day.id = service.business_day_id
left join public.orders ordine
  on ordine.service_id = service.id
 and ordine.status = 'preparing'
 and ordine.payment_status <> 'awaiting'
left join public.order_items item
  on item.order_id = ordine.id
 and item.revision = (select max(revision) from public.order_items where order_id = ordine.id)
left join public.products product on product.id = item.product_id
where service.status = 'open' and day.status = 'open'
group by service.id;
revoke all on table public.public_queue_status from public, anon, authenticated;
grant select on table public.public_queue_status to anon, authenticated;
