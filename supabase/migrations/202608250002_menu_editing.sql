-- Modifica completa del menu dal pannello Creator.
--
-- La migrazione iniziale permetteva soltanto prezzo e disponibilita'
-- (save_product). Qui il Creator puo' creare un prodotto, rinominarlo nelle due
-- lingue, cambiarne tipo, prezzo, ordine, ingredienti inclusi, aggiunte
-- disponibili e allergeni dichiarati.
--
-- Tutto passa da una RPC unica cosi' la modifica e' atomica: non esiste un
-- istante in cui una pizza ha gia' i nuovi ingredienti ma ancora il vecchio
-- prezzo. Lo schema del payload e' chiuso: una chiave sconosciuta e' un errore,
-- non un campo ignorato in silenzio.

create or replace function public.slugify(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g'), '-'), '');
$$;

create or replace function public.upsert_menu_product(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
  v_slug text;
  v_type text;
  v_price integer;
  v_available boolean;
  v_sort integer;
  v_translations jsonb;
  v_ingredients jsonb;
  v_allergens jsonb;
  v_ingredient jsonb;
  v_ingredient_id uuid;
  v_ingredient_slug text;
  v_locale text;
  v_entry jsonb;
  v_created boolean := false;
  v_included boolean;
  v_can_add boolean;
  v_allergen uuid;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;

  if jsonb_typeof(payload) <> 'object' then
    raise exception 'payload must be a JSON object' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_object_keys(payload) as key
     where not (key = any(array[
       'product_id', 'slug', 'product_type', 'price_cents', 'available',
       'sort_order', 'translations', 'ingredients', 'allergen_ids'
     ]))
  ) then
    raise exception 'unknown key in menu payload' using errcode = '22023';
  end if;

  v_product_id := nullif(payload ->> 'product_id', '')::uuid;
  v_type := coalesce(payload ->> 'product_type', 'pizza');
  v_price := coalesce(nullif(payload ->> 'price_cents', '')::integer, 0);
  v_available := coalesce((payload ->> 'available')::boolean, true);
  v_sort := coalesce(nullif(payload ->> 'sort_order', '')::integer, 0);
  v_translations := coalesce(payload -> 'translations', '{}'::jsonb);
  v_ingredients := coalesce(payload -> 'ingredients', '[]'::jsonb);
  v_allergens := coalesce(payload -> 'allergen_ids', '[]'::jsonb);

  if v_type not in ('pizza', 'drink') then
    raise exception 'product type must be pizza or drink' using errcode = '22023';
  end if;
  if v_price <= 0 then
    raise exception 'price must be positive' using errcode = '22023';
  end if;
  if coalesce(btrim(v_translations #>> '{it,name}'), '') = '' then
    raise exception 'the italian name is required' using errcode = '22023';
  end if;
  if jsonb_array_length(v_ingredients) > 40 then
    raise exception 'a product cannot carry more than 40 ingredients' using errcode = '22023';
  end if;

  v_slug := coalesce(public.slugify(payload ->> 'slug'), public.slugify(v_translations #>> '{it,name}'));
  if v_slug is null then
    raise exception 'the product needs a usable name' using errcode = '22023';
  end if;

  if v_product_id is null then
    insert into public.products (slug, product_type, price_cents, available, sort_order)
    values (v_slug, v_type, v_price, v_available, v_sort)
    returning id into v_product_id;
    v_created := true;
  else
    update public.products set
      slug = v_slug,
      product_type = v_type,
      price_cents = v_price,
      available = v_available,
      sort_order = v_sort
     where id = v_product_id;
    if not found then
      raise exception 'product not found' using errcode = '22023';
    end if;
  end if;

  -- Traduzioni: l'italiano e' obbligatorio, l'inglese facoltativo.
  delete from public.product_translations where product_id = v_product_id;
  for v_locale in select jsonb_object_keys(v_translations) loop
    if v_locale not in ('it', 'en') then
      raise exception 'unsupported locale %', v_locale using errcode = '22023';
    end if;
    v_entry := v_translations -> v_locale;
    if coalesce(btrim(v_entry ->> 'name'), '') <> '' then
      insert into public.product_translations (product_id, locale, name, description)
      values (v_product_id, v_locale, btrim(v_entry ->> 'name'), coalesce(btrim(v_entry ->> 'description'), ''));
    end if;
  end loop;

  -- Ingredienti: si riusa quello esistente con lo stesso slug, altrimenti si crea.
  delete from public.product_ingredients where product_id = v_product_id;
  for v_ingredient in select value from jsonb_array_elements(v_ingredients) loop
    if exists (
      select 1 from jsonb_object_keys(v_ingredient) as key
       where not (key = any(array[
         'name_it', 'name_en', 'included', 'removable', 'can_add',
         'addition_price_cents', 'max_quantity', 'sort_order'
       ]))
    ) then
      raise exception 'unknown key in ingredient payload' using errcode = '22023';
    end if;

    v_ingredient_slug := public.slugify(v_ingredient ->> 'name_it');
    if v_ingredient_slug is null then
      raise exception 'every ingredient needs an italian name' using errcode = '22023';
    end if;

    select id into v_ingredient_id from public.ingredients where slug = v_ingredient_slug;
    if v_ingredient_id is null then
      insert into public.ingredients (slug, additional_price_cents, available)
      values (v_ingredient_slug, coalesce(nullif(v_ingredient ->> 'addition_price_cents', '')::integer, 0), true)
      returning id into v_ingredient_id;
    else
      update public.ingredients
         set additional_price_cents = coalesce(nullif(v_ingredient ->> 'addition_price_cents', '')::integer, additional_price_cents)
       where id = v_ingredient_id;
    end if;

    delete from public.ingredient_translations where ingredient_id = v_ingredient_id;
    insert into public.ingredient_translations (ingredient_id, locale, name)
    values (v_ingredient_id, 'it', btrim(v_ingredient ->> 'name_it'));
    if coalesce(btrim(v_ingredient ->> 'name_en'), '') <> '' then
      insert into public.ingredient_translations (ingredient_id, locale, name)
      values (v_ingredient_id, 'en', btrim(v_ingredient ->> 'name_en'));
    end if;

    -- Si puo' togliere solo cio' che c'e': removable ha senso solo se incluso.
    -- E una riga che non e' ne' inclusa ne' aggiungibile non direbbe nulla.
    v_included := coalesce((v_ingredient ->> 'included')::boolean, false);
    v_can_add := coalesce((v_ingredient ->> 'can_add')::boolean, not v_included);
    if not v_included and not v_can_add then
      raise exception 'an ingredient must be included or addable' using errcode = '22023';
    end if;

    insert into public.product_ingredients (
      product_id, ingredient_id, is_included, removable, can_add, max_quantity, sort_order
    ) values (
      v_product_id, v_ingredient_id,
      v_included,
      v_included and coalesce((v_ingredient ->> 'removable')::boolean, true),
      v_can_add,
      coalesce(nullif(v_ingredient ->> 'max_quantity', '')::integer, 1),
      coalesce(nullif(v_ingredient ->> 'sort_order', '')::integer, 0)
    )
    on conflict (product_id, ingredient_id) do update set
      is_included = excluded.is_included,
      removable = excluded.removable,
      can_add = excluded.can_add,
      max_quantity = excluded.max_quantity,
      sort_order = excluded.sort_order;
  end loop;

  -- Allergeni: solo quelli dell'elenco UE gia' presente in tabella.
  delete from public.product_allergens where product_id = v_product_id;
  for v_allergen in select (value #>> '{}')::uuid from jsonb_array_elements(v_allergens) loop
    if not exists (select 1 from public.allergens where id = v_allergen) then
      raise exception 'unknown allergen' using errcode = '22023';
    end if;
    insert into public.product_allergens (product_id, allergen_id) values (v_product_id, v_allergen)
    on conflict do nothing;
  end loop;

  insert into public.events (actor_id, actor_kind, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'creator',
    case when v_created then 'menu.product-created' else 'menu.product-updated' end,
    'product', v_product_id,
    jsonb_build_object('slug', v_slug, 'price_cents', v_price, 'available', v_available)
  );

  return v_product_id;
end;
$$;

create or replace function public.delete_menu_product(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_slug text;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;

  select slug into v_slug from public.products where id = p_product_id;
  if v_slug is null then
    raise exception 'product not found' using errcode = '22023';
  end if;

  -- Un prodotto gia' venduto resta: cancellarlo riscriverebbe ordini passati.
  -- In quel caso si disattiva, cosi' sparisce dal menu ma lo storico regge.
  if exists (select 1 from public.order_items where product_id = p_product_id) then
    update public.products set available = false where id = p_product_id;
    insert into public.events (actor_id, actor_kind, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'creator', 'menu.product-disabled', 'product', p_product_id,
            jsonb_build_object('slug', v_slug, 'reason', 'used-in-orders'));
    return 'disabled';
  end if;

  delete from public.products where id = p_product_id;
  insert into public.events (actor_id, actor_kind, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'creator', 'menu.product-deleted', 'product', p_product_id,
          jsonb_build_object('slug', v_slug));
  return 'deleted';
end;
$$;

revoke all on function public.upsert_menu_product(jsonb) from public, anon;
grant execute on function public.upsert_menu_product(jsonb) to authenticated;
revoke all on function public.delete_menu_product(uuid) from public, anon;
grant execute on function public.delete_menu_product(uuid) to authenticated;

comment on function public.upsert_menu_product(jsonb) is
  'Creator-only atomic menu edit: product, translations, ingredients and allergens in one transaction.';
comment on function public.delete_menu_product(uuid) is
  'Creator-only removal: deletes an unused product, disables one already sold.';
