-- L'attesa che vede chi ordina.
--
-- Il server calcola bene l'orario di consegna, ma chi guarda il menu non e'
-- collegato e non puo' leggere gli ordini degli altri: senza dati vedeva sempre
-- «pronto in 9 minuti», anche con dodici pizze in forno. Un numero rassicurante
-- e falso e' peggio di un numero alto.
--
-- Qui esce un dato solo, quante pizze ci sono in coda adesso: nessun nome,
-- nessun numero di telefono, nessun ordine. E' la stessa cosa che direbbe al
-- telefono chi risponde. Con quello e con le impostazioni del forno il menu
-- calcola l'attesa con la stessa formula del server.

drop view if exists public.public_queue_status;
create view public.public_queue_status with (security_barrier = true) as
select
  service.id as service_id,
  coalesce(sum(item.quantity) filter (where product.product_type = 'pizza'), 0)::integer as pizzas_queued
from public.services service
join public.business_days day on day.id = service.business_day_id
left join public.orders ordine
  on ordine.service_id = service.id and ordine.status = 'preparing'
left join public.order_items item
  on item.order_id = ordine.id
 and item.revision = (select max(revision) from public.order_items where order_id = ordine.id)
left join public.products product on product.id = item.product_id
where service.status = 'open' and day.status = 'open'
group by service.id;

revoke all on table public.public_queue_status from public, anon, authenticated;
grant select on table public.public_queue_status to anon, authenticated;

-- L'orario promesso al singolo ordine, per la ricevuta. Lo si legge solo con il
-- gettone ricevuto al momento dell'invio: e' la prova di essere chi ha ordinato.
create or replace function public.public_order_eta(p_order_id uuid, p_request_token uuid)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_minutes integer;
begin
  select round(extract(epoch from (eta_ready_at - created_at)) / 60)::integer
    into v_minutes
    from public.orders
   where id = p_order_id and client_request_token = p_request_token;
  return v_minutes;
end;
$$;

revoke all on function public.public_order_eta(uuid, uuid) from public;
grant execute on function public.public_order_eta(uuid, uuid) to anon, authenticated;
