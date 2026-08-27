-- Il numero di telefono di un turista.
--
-- La pizzeria e' in una citta' piena di gente che arriva da fuori: chi ordina
-- puo' avere un numero inglese, tedesco, americano. Finora il database ne
-- accettava uno solo, quello italiano, e a un turista rispondeva che il suo
-- numero non era valido.
--
-- Il numero si conserva in formato internazionale, l'unico che funziona per
-- chiamare e per mandare un messaggio da qualunque paese. Chi scrive senza
-- prefisso e' italiano: e' una pizzeria di Milano, non un servizio mondiale.

create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_phone is null or btrim(p_phone) = '' then ''
    when btrim(p_phone) like '+%' then '+' || regexp_replace(p_phone, '[^0-9]', '', 'g')
    -- «00» e' il prefisso internazionale, ma un fisso italiano comincia per 0 e
    -- un numero inventato per 000: internazionale solo se dopo c'e' un paese.
    when regexp_replace(p_phone, '[^0-9]', '', 'g') like '00%'
      and substr(regexp_replace(p_phone, '[^0-9]', '', 'g'), 3, 1) <> '0'
      then '+' || substr(regexp_replace(p_phone, '[^0-9]', '', 'g'), 3)
    else '+39' || regexp_replace(p_phone, '[^0-9]', '', 'g')
  end;
$$;

create or replace function public.is_valid_phone(p_phone text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_coda text;
  v_salto integer;
  v_i integer;
  v_crescente boolean;
begin
  -- Da dieci a quindici cifre, prefisso compreso.
  if length(v_digits) < 10 or length(v_digits) > 15 then
    return false;
  end if;

  -- Un numero finto lo si riconosce dalla parte nazionale, non dal prefisso:
  -- «+39 0000000000» ha il prefisso giusto e il resto inventato. Non sapendo
  -- quanto e' lungo il prefisso, si guarda togliendone da zero a tre cifre.
  for v_salto in 0 .. 3 loop
    v_coda := substr(v_digits, v_salto + 1);
    if length(v_coda) >= 7 then
      if v_coda ~ '^(.)\1+$' then
        return false;
      end if;
      v_crescente := true;
      for v_i in 2 .. length(v_coda) loop
        if (substr(v_coda, v_i, 1)::integer + 10 - substr(v_coda, v_i - 1, 1)::integer) % 10 <> 1 then
          v_crescente := false;
          exit;
        end if;
      end loop;
      if v_crescente then
        return false;
      end if;
    end if;
  end loop;

  return true;
end;
$$;

-- Le due funzioni che prendono un ordine, ridefinite con la sola validazione
-- del telefono cambiata: tutto il resto e' identico a com'era.

CREATE OR REPLACE FUNCTION public.create_public_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_service public.services%rowtype;
  v_product public.products%rowtype;
  v_existing record;
  v_business_date date;
  v_business_status text;
  v_service_id uuid;
  v_request_token uuid;
  v_request_fingerprint bytea;
  v_item jsonb;
  v_change jsonb;
  v_relation record;
  v_order_id uuid := extensions.gen_random_uuid();
  v_order_item_id uuid;
  v_sequence integer;
  v_name text;
  v_phone text;
  v_email text;
  v_payment_method text;
  v_product_name text;
  v_note text;
  v_product_id uuid;
  v_ingredient_id uuid;
  v_quantity integer;
  v_change_quantity integer;
  v_unit_price integer;
  v_gross integer := 0;
  v_fee integer;
  v_fee_rate numeric;
  v_item_count integer;
  v_total_units integer := 0;
  v_item_position integer := 0;
  v_normalized_items jsonb := '[]'::jsonb;
  v_normalized_changes jsonb;
  v_normalized_request jsonb;
  v_server_items jsonb := '[]'::jsonb;
  v_server_changes jsonb;
  v_allergens jsonb;
  v_revision_snapshot jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(payload::text) > 32768 then
    raise exception 'payload exceeds 32768 bytes' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(payload) as payload_key(key)
    where not (key = any(array['request_token', 'service_id', 'customer', 'payment_method', 'items']))
  ) then
    raise exception 'unknown top-level key' using errcode = '22023';
  end if;

  if coalesce(payload ->> 'request_token', '') = '' then
    raise exception 'request_token is required' using errcode = '22023';
  end if;
  begin
    v_request_token := (payload ->> 'request_token')::uuid;
    v_service_id := (payload ->> 'service_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'request_token and service_id must be UUIDs' using errcode = '22023';
  end;

  if jsonb_typeof(payload -> 'customer') <> 'object' then
    raise exception 'customer must be a JSON object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(payload -> 'customer') as customer_key(key)
    where not (key = any(array['name', 'phone', 'email']))
  ) then
    raise exception 'unknown customer key' using errcode = '22023';
  end if;

  if jsonb_typeof(payload -> 'items') <> 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(payload -> 'items');
  if v_item_count < 1 or v_item_count > 20 then
    raise exception 'an order must contain between 1 and 20 items' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(payload -> 'customer' ->> 'name', ''));
  v_phone := regexp_replace(coalesce(payload -> 'customer' ->> 'phone', ''), '[^0-9+]', '', 'g');
  v_email := nullif(lower(btrim(coalesce(payload -> 'customer' ->> 'email', ''))), '');
  v_payment_method := coalesce(payload ->> 'payment_method', '');

  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'customer name is required' using errcode = '22023';
  end if;
  v_phone := public.normalize_phone(v_phone);
  if not public.is_valid_phone(v_phone) then
    raise exception 'invalid phone number' using errcode = '22023';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'invalid email address' using errcode = '22023';
  end if;
  if v_payment_method not in ('cash', 'apple_pay', 'google_pay') then
    raise exception 'unsupported payment method' using errcode = '22023';
  end if;

  -- Canonicalize only the documented client contract. This representation is
  -- hashed for idempotency; raw or unknown JSON never reaches order history.
  for v_item in select value from jsonb_array_elements(payload -> 'items') loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each item must be a JSON object' using errcode = '22023';
    end if;
    if v_item ?| array['price', 'price_cents', 'unit_price', 'unit_price_cents', 'total', 'total_cents', 'total_price_cents'] then
      raise exception 'prices must not be supplied by the client' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_item) as item_key(key)
      where not (key = any(array['product_id', 'quantity', 'note', 'changes']))
    ) then
      raise exception 'unknown item key' using errcode = '22023';
    end if;

    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_quantity := coalesce(nullif(v_item ->> 'quantity', '')::integer, 1);
    exception when invalid_text_representation then
      raise exception 'invalid item identifier or quantity' using errcode = '22023';
    end;
    if v_quantity < 1 or v_quantity > 20 then
      raise exception 'item quantity must be between 1 and 20' using errcode = '22023';
    end if;
    v_total_units := v_total_units + v_quantity;
    if v_total_units > 50 then
      raise exception 'order quantity exceeds 50 units' using errcode = '22023';
    end if;

    v_note := btrim(coalesce(v_item ->> 'note', ''));
    if char_length(v_note) > 500 then
      raise exception 'item note is too long' using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(v_item -> 'changes'), 'array') <> 'array' then
      raise exception 'item changes must be a JSON array' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(v_item -> 'changes', '[]'::jsonb)) > 20 then
      raise exception 'an item cannot contain more than 20 changes' using errcode = '22023';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(coalesce(v_item -> 'changes', '[]'::jsonb)) as duplicate_change(value)
       group by value ->> 'type', value ->> 'ingredient_id'
      having count(*) > 1
    ) then
      raise exception 'duplicate item change' using errcode = '22023';
    end if;

    v_normalized_changes := '[]'::jsonb;
    for v_change in select value from jsonb_array_elements(coalesce(v_item -> 'changes', '[]'::jsonb)) loop
      if jsonb_typeof(v_change) <> 'object' then
        raise exception 'each change must be a JSON object' using errcode = '22023';
      end if;
      if exists (
        select 1 from jsonb_object_keys(v_change) as change_key(key)
        where not (key = any(array['type', 'ingredient_id', 'quantity']))
      ) then
        raise exception 'unknown change key' using errcode = '22023';
      end if;
      if coalesce(v_change ->> 'type', '') not in ('removed', 'addition') then
        raise exception 'invalid item change' using errcode = '22023';
      end if;
      begin
        v_ingredient_id := (v_change ->> 'ingredient_id')::uuid;
        v_change_quantity := coalesce(nullif(v_change ->> 'quantity', '')::integer, 1);
      exception when invalid_text_representation then
        raise exception 'invalid change identifier or quantity' using errcode = '22023';
      end;
      if v_change_quantity < 1 or v_change_quantity > 10 then
        raise exception 'change quantity must be between 1 and 10' using errcode = '22023';
      end if;
      v_normalized_changes := v_normalized_changes || jsonb_build_array(jsonb_build_object(
        'type', v_change ->> 'type',
        'ingredient_id', v_ingredient_id,
        'quantity', v_change_quantity
      ));
    end loop;

    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'quantity', v_quantity,
      'note', v_note,
      'changes', v_normalized_changes
    ));
  end loop;

  v_normalized_request := jsonb_build_object(
    'service_id', v_service_id,
    'customer', jsonb_build_object('name', v_name, 'phone', v_phone, 'email', v_email),
    'payment_method', v_payment_method,
    'items', v_normalized_items
  );
  v_request_fingerprint := extensions.digest(v_normalized_request::text, 'sha256');

  select orders.id, orders.request_fingerprint, orders.sequence, orders.status,
         orders.gross_cents, orders.fee_cents, orders.total_cents, day.business_date
    into v_existing
    from public.orders orders
    join public.business_days day on day.id = orders.business_day_id
   where orders.client_request_token = v_request_token;
  if found then
    if v_existing.request_fingerprint <> v_request_fingerprint then
      raise exception 'idempotency token already used with different payload' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'order_id', v_existing.id,
      'business_date', v_existing.business_date,
      'sequence', v_existing.sequence,
      'status', v_existing.status,
      'gross_cents', v_existing.gross_cents,
      'fee_cents', v_existing.fee_cents,
      'total_cents', v_existing.total_cents
    );
  end if;

  select *
    into v_service
    from public.services
   where id = v_service_id
     and status = 'open'
     and online_orders_enabled
   for update;

  if not found then
    raise exception 'online ordering service is not open' using errcode = 'P0001';
  end if;

  select business_date, status
    into v_business_date, v_business_status
    from public.business_days
   where id = v_service.business_day_id;

  if v_business_status is distinct from 'open' then
    raise exception 'business day is not open' using errcode = 'P0001';
  end if;

  if (
    select count(*)
      from public.orders
     where customer_phone = v_phone
       and source = 'web'
       and created_at >= clock_timestamp() - interval '10 minutes'
  ) >= 5 then
    raise exception 'too many recent orders for this phone' using errcode = 'P0001';
  end if;

  -- Validate catalog relations and build a complete server-derived snapshot.
  for v_item in select value from jsonb_array_elements(v_normalized_items) loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    select *
      into v_product
      from public.products
     where id = v_product_id
       and available
       for share;
    if not found then
      raise exception 'product is unavailable' using errcode = '22023';
    end if;

    select coalesce(
             (select translation.name from public.product_translations translation
               where translation.product_id = v_product.id and translation.locale = 'it'),
             v_product.slug
           ) into v_product_name;
    select coalesce(
             jsonb_agg(jsonb_build_object('id', allergen.id, 'label_it', allergen.label_it, 'label_en', allergen.label_en) order by allergen.eu_order),
             '[]'::jsonb
           )
      into v_allergens
      from public.product_allergens product_allergen
      join public.allergens allergen on allergen.id = product_allergen.allergen_id
     where product_allergen.product_id = v_product.id;

    v_unit_price := v_product.price_cents;
    v_server_changes := '[]'::jsonb;
    for v_change in select value from jsonb_array_elements(v_item -> 'changes') loop
      v_ingredient_id := (v_change ->> 'ingredient_id')::uuid;
      v_change_quantity := (v_change ->> 'quantity')::integer;
      select pi.is_included, pi.removable, pi.can_add, pi.max_quantity,
             ingredient.available, ingredient.additional_price_cents,
             coalesce(name_it.name, ingredient.slug) as name_it,
             coalesce(name_en.name, name_it.name, ingredient.slug) as name_en
        into v_relation
        from public.product_ingredients pi
        join public.ingredients ingredient on ingredient.id = pi.ingredient_id
        left join public.ingredient_translations name_it
          on name_it.ingredient_id = ingredient.id and name_it.locale = 'it'
        left join public.ingredient_translations name_en
          on name_en.ingredient_id = ingredient.id and name_en.locale = 'en'
       where pi.product_id = v_product.id
         and pi.ingredient_id = v_ingredient_id
       for share of pi, ingredient;

      if not found or not v_relation.available then
        raise exception 'ingredient is unavailable for this product' using errcode = '22023';
      end if;

      if v_change ->> 'type' = 'removed' then
        if not v_relation.is_included or not v_relation.removable or v_change_quantity <> 1 then
          raise exception 'ingredient cannot be removed' using errcode = '22023';
        end if;
      else
        if not v_relation.can_add or v_change_quantity < 1 or v_change_quantity > v_relation.max_quantity then
          raise exception 'ingredient addition exceeds its allowed quantity' using errcode = '22023';
        end if;
        v_unit_price := v_unit_price + (v_relation.additional_price_cents * v_change_quantity);
      end if;
      v_server_changes := v_server_changes || jsonb_build_array(jsonb_build_object(
        'type', v_change ->> 'type',
        'ingredient_id', v_ingredient_id,
        'name_it', v_relation.name_it,
        'name_en', v_relation.name_en,
        'unit_price_cents', case when v_change ->> 'type' = 'addition' then v_relation.additional_price_cents else 0 end,
        'quantity', v_change_quantity
      ));
    end loop;

    v_gross := v_gross + (v_unit_price * v_quantity);
    v_server_items := v_server_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_type', v_product.product_type,
      'name_it', v_product_name,
      'unit_price_cents', v_unit_price,
      'quantity', v_quantity,
      'total_price_cents', v_unit_price * v_quantity,
      'note', v_item ->> 'note',
      'changes', v_server_changes,
      'allergens', v_allergens
    ));
  end loop;

  v_fee_rate := case v_payment_method when 'cash' then 0 else 0.02 end;
  v_fee := round(v_gross * v_fee_rate)::integer;

  begin
    v_sequence := public.next_order_sequence(v_service.business_day_id);
    insert into public.orders (
      id, business_day_id, service_id, client_request_token, request_fingerprint,
      sequence, source, status, customer_name, customer_phone, customer_email,
      payment_method, gross_cents, fee_cents, total_cents, eta_ready_at
    ) values (
      v_order_id, v_service.business_day_id, v_service.id, v_request_token, v_request_fingerprint,
      v_sequence, 'web', 'preparing', v_name, v_phone, v_email,
      v_payment_method, v_gross, v_fee, v_gross, now() + interval '10 minutes'
    );
  exception when unique_violation then
    select orders.id, orders.request_fingerprint, orders.sequence, orders.status,
           orders.gross_cents, orders.fee_cents, orders.total_cents, day.business_date
      into v_existing
      from public.orders orders
      join public.business_days day on day.id = orders.business_day_id
     where orders.client_request_token = v_request_token;
    if not found then
      raise;
    end if;
    if v_existing.request_fingerprint <> v_request_fingerprint then
      raise exception 'idempotency token already used with different payload' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'order_id', v_existing.id,
      'business_date', v_existing.business_date,
      'sequence', v_existing.sequence,
      'status', v_existing.status,
      'gross_cents', v_existing.gross_cents,
      'fee_cents', v_existing.fee_cents,
      'total_cents', v_existing.total_cents
    );
  end;

  v_revision_snapshot := jsonb_build_object(
    'schema_version', 1,
    'request_token', v_request_token,
    'business_day_id', v_service.business_day_id,
    'business_date', v_business_date,
    'service_id', v_service.id,
    'customer', jsonb_build_object('name', v_name, 'phone', v_phone, 'email', v_email),
    'payment_method', v_payment_method,
    'items', v_server_items,
    'gross_cents', v_gross,
    'fee_cents', v_fee,
    'total_cents', v_gross
  );
  insert into public.order_revisions (
    order_id, revision, snapshot, gross_cents, fee_cents, total_cents, reason
  ) values (
    v_order_id, 1, v_revision_snapshot, v_gross, v_fee, v_gross, 'Ordine originale'
  );

  for v_item in select value from jsonb_array_elements(v_server_items) loop
    v_item_position := v_item_position + 1;
    v_order_item_id := extensions.gen_random_uuid();
    insert into public.order_items (
      id, order_id, revision, product_id, product_name_snapshot, unit_price_cents,
      quantity, total_price_cents, allergens_snapshot, note, sort_order
    ) values (
      v_order_item_id, v_order_id, 1, (v_item ->> 'product_id')::uuid, v_item ->> 'name_it',
      (v_item ->> 'unit_price_cents')::integer, (v_item ->> 'quantity')::integer,
      (v_item ->> 'total_price_cents')::integer, v_item -> 'allergens', v_item ->> 'note', v_item_position
    );

    for v_change in select value from jsonb_array_elements(v_item -> 'changes') loop
      insert into public.order_item_changes (
        order_item_id, ingredient_id, change_type, ingredient_name_snapshot,
        unit_price_cents, quantity
      ) values (
        v_order_item_id,
        (v_change ->> 'ingredient_id')::uuid,
        v_change ->> 'type',
        v_change ->> 'name_it',
        (v_change ->> 'unit_price_cents')::integer,
        (v_change ->> 'quantity')::integer
      );
    end loop;
  end loop;

  insert into public.events (
    actor_kind, action, entity_type, entity_id, business_day_id, metadata
  ) values (
    'public', 'order.created', 'order', v_order_id, v_service.business_day_id,
    jsonb_build_object('source', 'web', 'sequence', v_sequence, 'service_id', v_service.id)
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'business_date', v_business_date,
    'sequence', v_sequence,
    'status', 'preparing',
    'gross_cents', v_gross,
    'fee_cents', v_fee,
    'total_cents', v_gross
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_restaurant_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_service public.services%rowtype;
  v_business_date date;
  v_business_status text;
  v_service_id uuid;
  v_order_id uuid := extensions.gen_random_uuid();
  v_actor_id uuid := nullif(auth.jwt() ->> 'sub', '')::uuid;
  v_name text;
  v_phone text;
  v_email text;
  v_payment_method text;
  v_priced jsonb;
  v_server_items jsonb;
  v_snapshot jsonb;
  v_gross integer;
  v_fee integer;
  v_sequence integer;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(payload::text) > 32768 then
    raise exception 'payload exceeds 32768 bytes' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(payload) as payload_key(key)
    where not (key = any(array['service_id', 'customer', 'payment_method', 'items']))
  ) then
    raise exception 'unknown top-level key' using errcode = '22023';
  end if;
  if jsonb_typeof(payload -> 'customer') <> 'object' then
    raise exception 'customer must be a JSON object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(payload -> 'customer') as customer_key(key)
    where not (key = any(array['name', 'phone', 'email']))
  ) then
    raise exception 'unknown customer key' using errcode = '22023';
  end if;
  begin
    v_service_id := (payload ->> 'service_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'service_id must be a UUID' using errcode = '22023';
  end;
  v_name := btrim(coalesce(payload -> 'customer' ->> 'name', ''));
  v_phone := regexp_replace(coalesce(payload -> 'customer' ->> 'phone', ''), '[^0-9+]', '', 'g');
  v_email := nullif(lower(btrim(coalesce(payload -> 'customer' ->> 'email', ''))), '');
  v_payment_method := coalesce(payload ->> 'payment_method', '');
  if char_length(v_name) not between 1 and 120 then
    raise exception 'customer name is required' using errcode = '22023';
  end if;
  v_phone := public.normalize_phone(v_phone);
  if not public.is_valid_phone(v_phone) then
    raise exception 'invalid phone number' using errcode = '22023';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'invalid email address' using errcode = '22023';
  end if;
  if v_payment_method not in ('cash', 'apple_pay', 'google_pay') then
    raise exception 'unsupported payment method' using errcode = '22023';
  end if;

  select * into v_service
    from public.services
   where id = v_service_id and status = 'open'
   for update;
  if not found then
    raise exception 'restaurant service is not open' using errcode = 'P0001';
  end if;
  select business_date, status into v_business_date, v_business_status
    from public.business_days where id = v_service.business_day_id;
  if v_business_status is distinct from 'open' then
    raise exception 'business day is not open' using errcode = 'P0001';
  end if;

  v_priced := public.build_server_order_items(payload -> 'items');
  v_server_items := v_priced -> 'items';
  v_gross := (v_priced ->> 'gross_cents')::integer;
  v_fee := case when v_payment_method = 'cash' then 0 else round(v_gross * 0.02)::integer end;
  v_sequence := public.next_order_sequence(v_service.business_day_id);

  insert into public.orders (
    id, business_day_id, service_id, sequence, source, status, customer_name,
    customer_phone, customer_email, payment_method, gross_cents, fee_cents,
    total_cents, eta_ready_at, created_by
  ) values (
    v_order_id, v_service.business_day_id, v_service.id, v_sequence, 'restaurant',
    'preparing', v_name, v_phone, v_email, v_payment_method, v_gross, v_fee,
    v_gross, now() + interval '10 minutes', v_actor_id
  );
  v_snapshot := jsonb_build_object(
    'schema_version', 1, 'business_day_id', v_service.business_day_id,
    'business_date', v_business_date, 'service_id', v_service.id,
    'customer', jsonb_build_object('name', v_name, 'phone', v_phone, 'email', v_email),
    'payment_method', v_payment_method, 'items', v_server_items,
    'gross_cents', v_gross, 'fee_cents', v_fee, 'total_cents', v_gross
  );
  insert into public.order_revisions (
    order_id, revision, snapshot, gross_cents, fee_cents, total_cents, reason, created_by
  ) values (
    v_order_id, 1, v_snapshot, v_gross, v_fee, v_gross, 'Ordine originale', v_actor_id
  );
  perform public.insert_order_revision_items(v_order_id, 1, v_server_items);
  insert into public.events (
    actor_id, actor_kind, action, entity_type, entity_id, business_day_id, metadata
  ) values (
    v_actor_id, 'creator', 'order.created', 'order', v_order_id, v_service.business_day_id,
    jsonb_build_object('source', 'restaurant', 'sequence', v_sequence, 'service_id', v_service.id)
  );
  return jsonb_build_object(
    'order_id', v_order_id, 'business_date', v_business_date, 'sequence', v_sequence,
    'status', 'preparing', 'revision', 1, 'gross_cents', v_gross,
    'fee_cents', v_fee, 'total_cents', v_gross
  );
end;
$function$;
