-- Come sta andando il mio ordine.
--
-- Chi ha ordinato aspetta dieci minuti senza sapere niente: la ricevuta dice
-- l'orario promesso e poi tace. Sapere che la pizza e' in forno, e poi che e'
-- pronta, e' l'unica cosa che serve davvero in quei dieci minuti.
--
-- Il cliente non e' collegato e non puo' leggere gli ordini: legge solo il
-- proprio, e solo mostrando il gettone ricevuto al momento dell'invio. Esce lo
-- stato e i minuti che restano, niente altro: nessun nome, nessun telefono,
-- nessun totale.

create or replace function public.public_order_progress(p_order_id uuid, p_request_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
    from public.orders
   where id = p_order_id and client_request_token = p_request_token;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'status', v_order.status,
    'sequence', v_order.sequence,
    'minutes_left', greatest(0, ceil(extract(epoch from (v_order.eta_ready_at - now())) / 60))::integer,
    'promised_minutes', round(extract(epoch from (v_order.eta_ready_at - v_order.created_at)) / 60)::integer
  );
end;
$$;

revoke all on function public.public_order_progress(uuid, uuid) from public;
grant execute on function public.public_order_progress(uuid, uuid) to anon, authenticated;
