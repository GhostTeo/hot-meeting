-- La pizza della settimana: una (o piu') pizze messe in evidenza in cima al
-- menu, senza doverle ricreare. E' un semplice contrassegno sul prodotto, che il
-- Creator accende e spegne quando vuole; il cliente le vede in una sezione a
-- parte "Pizza della settimana".

alter table public.products
  add column if not exists weekly boolean not null default false;

-- Il salvataggio prodotto ora porta anche il contrassegno "settimana". La vecchia
-- firma a tre argomenti viene sostituita da questa a quattro: con p_weekly che ha
-- un valore di default, i client che mandano solo prezzo/disponibilita' continuano
-- a funzionare (l'argomento mancante resta null e il valore in tabella non cambia).
drop function if exists public.save_product(uuid, integer, boolean);

create or replace function public.save_product(
  p_product_id uuid,
  p_price_cents integer default null,
  p_available boolean default null,
  p_weekly boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product public.products%rowtype;
  v_actor_id uuid;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;
  if p_price_cents is not null and p_price_cents <= 0 then
    raise exception 'price must be positive' using errcode = '22023';
  end if;
  begin
    v_actor_id := nullif(auth.jwt() ->> 'sub', '')::uuid;
  exception when invalid_text_representation then
    v_actor_id := null;
  end;
  update public.products set
    price_cents = coalesce(p_price_cents, price_cents),
    available   = coalesce(p_available, available),
    weekly      = coalesce(p_weekly, weekly),
    updated_at  = now()
   where id = p_product_id
  returning * into v_product;
  if not found then
    raise exception 'product not found' using errcode = '22023';
  end if;
  insert into public.events (actor_id, actor_kind, action, entity_type, entity_id, metadata)
  values (
    v_actor_id, 'creator', 'product.updated', 'product', v_product.id,
    jsonb_build_object('price_cents', v_product.price_cents, 'available', v_product.available, 'weekly', v_product.weekly)
  );
  return jsonb_build_object(
    'id', v_product.id, 'slug', v_product.slug, 'product_type', v_product.product_type,
    'price_cents', v_product.price_cents, 'available', v_product.available, 'weekly', v_product.weekly
  );
end;
$$;

revoke all on function public.save_product(uuid, integer, boolean, boolean) from public, anon;
grant execute on function public.save_product(uuid, integer, boolean, boolean) to authenticated;
