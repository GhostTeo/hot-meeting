-- Ordini blindati: si rimettono le difese perse e se ne aggiungono altre.
--
-- Le due riscritture di create_public_order per le prenotazioni (202609030001
-- e 202609040001) erano ripartite dal corpo di 202608240001_core.sql e avevano
-- perso, senza volerlo, quello che 202608270002 e 202608270003 avevano
-- aggiunto: il telefono internazionale normalizzato (un turista con +44 veniva
-- rifiutato), il nome che deve sembrare un nome, e il tetto di dieci ordini al
-- minuto per servizio contro l'alluvione di ordini finti. Qui tornano tutti,
-- con in piu':
--  - tetti globali (15 ordini web al minuto, 400 al giorno) e per numero
--    (8 al giorno), cosi' cambiare telefono a ogni ordine non serve a niente;
--  - una prenotazione deve avere almeno una pizza (solo le pizze passano dal
--    conto della capienza del forno) e ci sono al massimo 60 prenotazioni al
--    giorno e 3 aperte per numero;
--  - la vista public_booking_slots guarda solo due settimane, non tutta la
--    storia degli ordini;
--  - tre funzioni riservate al Creator che erano ancora chiamabili dall'anonimo
--    (fallivano comunque sul controllo del ruolo) vengono chiuse del tutto;
--  - un tempo massimo per le query dell'anonimo, cosi' una raffica di richieste
--    non puo' tenere occupato il database;
--  - il webhook di Stripe puo' ritrovare l'ordine anche dal suo id, non solo
--    dall'ultima sessione di pagamento;
--  - una tabella di contatori (rate_buckets) e la funzione rate_limit_hit per
--    la Edge Function place-order, che limita per indirizzo IP e verifica il
--    captcha (vedi docs/sicurezza.md).
-- test/schema.test.js controlla che l'ULTIMA definizione di create_public_order
-- contenga queste difese: una prossima riscrittura non potra' piu' perderle.

create or replace function public.create_public_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_service public.services%rowtype;
  v_day public.business_days%rowtype;
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
  v_requested_ready_at timestamptz;
  v_pizza_units integer := 0;
  v_slot_pizzas integer;
  v_slot_capacity integer;
  -- PRENOTAZIONE: turno e interruttore globale.
  v_shift text;
  v_bookings_enabled boolean;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(payload::text) > 32768 then
    raise exception 'payload exceeds 32768 bytes' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(payload) as payload_key(key)
    where not (key = any(array['request_token', 'service_id', 'customer', 'payment_method', 'items', 'requested_ready_at']))
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

  -- PRENOTAZIONE: un orario richiesto e' facoltativo. Se c'e', deve essere un
  -- quarto d'ora vero, abbastanza avanti da poter essere preparato e non
  -- troppo lontano (due settimane) da diventare una promessa vuota.
  if payload ? 'requested_ready_at' and coalesce(payload ->> 'requested_ready_at', '') <> '' then
    begin
      v_requested_ready_at := (payload ->> 'requested_ready_at')::timestamptz;
    exception when invalid_text_representation then
      raise exception 'requested_ready_at must be a timestamp' using errcode = '22023';
    end;
    v_requested_ready_at := date_trunc('minute', v_requested_ready_at);
    if v_requested_ready_at <= clock_timestamp() + interval '10 minutes' then
      raise exception 'requested_ready_at must be far enough in the future' using errcode = '22023';
    end if;
    if v_requested_ready_at > clock_timestamp() + interval '14 days' then
      raise exception 'requested_ready_at is too far in the future' using errcode = '22023';
    end if;
    if extract(minute from v_requested_ready_at)::integer % 15 <> 0 then
      raise exception 'requested_ready_at must fall on a quarter hour' using errcode = '22023';
    end if;
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

  -- BLINDATURA: nome che sembra un nome e telefono internazionale
  -- normalizzato (le difese di 202608270002/202608270003, che le due
  -- riscritture per le prenotazioni avevano perso ripartendo dal corpo core).
  if not public.looks_like_name(v_name) then
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
    'items', v_normalized_items,
    'requested_ready_at', v_requested_ready_at
  );
  v_request_fingerprint := extensions.digest(v_normalized_request::text, 'sha256');

  select orders.id, orders.request_fingerprint, orders.sequence, orders.status,
         orders.gross_cents, orders.fee_cents, orders.total_cents, orders.requested_ready_at,
         day.business_date
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
      'total_cents', v_existing.total_cents,
      'requested_ready_at', v_existing.requested_ready_at
    );
  end if;

  if v_requested_ready_at is null then
    -- Ordine immediato: come sempre, serve il servizio aperto e online.
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
  else
    -- PRENOTAZIONE: l'interruttore e' unico per la pizzeria.
    select bookings_enabled into v_bookings_enabled from public.pizzeria_settings where id = 1;
    if not coalesce(v_bookings_enabled, false) then
      raise exception 'bookings are not open' using errcode = 'P0001';
    end if;
    -- PRENOTAZIONE: giorno e turno li dice l'orario, in ora di Roma.
    v_business_date := (v_requested_ready_at at time zone 'Europe/Rome')::date;
    v_shift := public.booking_shift(v_requested_ready_at);
    if v_shift is null then
      raise exception 'requested_ready_at is outside service hours' using errcode = '22023';
    end if;
    -- PRENOTAZIONE: nei giorni di riposo o di ferie non si prenota; si
    -- prenota per il primo giorno aperto, che il menu propone da solo.
    if public.closure_on(v_business_date) then
      raise exception 'pizzeria is closed on the requested date' using errcode = 'P0001';
    end if;
    -- PRENOTAZIONE: stesso lucchetto di open_service/reopen_service sulla
    -- data, cosi' due prime prenotazioni per lo stesso turno non creano due
    -- servizi, e nessuna apertura passa in mezzo.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_business_date::text, 0));
    insert into public.business_days (business_date)
    values (v_business_date)
    on conflict (business_date) do nothing;
    select * into v_day from public.business_days
     where business_date = v_business_date for update;
    if v_day.status <> 'open' then
      raise exception 'business day is closed' using errcode = 'P0001';
    end if;
    select * into v_service from public.services
     where business_day_id = v_day.id and shift = v_shift
       for update;
    if not found then
      -- PRENOTAZIONE: il servizio nasce chiuso e senza ordini immediati; il
      -- forno lo eredita dalle impostazioni (trigger services_inherit_oven).
      -- Quando il locale apre quel turno, lo riapre cosi' com'e'.
      insert into public.services (
        business_day_id, shift, status, online_orders_enabled, capacity_pizzas_hour
      ) values (
        v_day.id, v_shift, 'closed', false, 90
      ) returning * into v_service;
      insert into public.events (
        actor_kind, action, entity_type, entity_id, business_day_id, metadata
      ) values (
        'public', 'service.created-for-booking', 'service', v_service.id, v_day.id,
        jsonb_build_object('shift', v_shift, 'business_date', v_business_date)
      );
    end if;
    v_business_status := v_day.status;
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

  -- BLINDATURA: i tetti che fermano un'alluvione di ordini finti anche se
  -- cambia numero a ogni ordine. Nessuna pizzeria vera li tocca:
  --  - dieci ordini al minuto per servizio (da 202608270003),
  --  - quindici ordini web al minuto e quattrocento al giorno in tutto,
  --  - otto ordini al giorno dallo stesso numero.
  if (
    select count(*) from public.orders
     where service_id = v_service.id and source = 'web'
       and created_at >= clock_timestamp() - interval '1 minute'
  ) >= 10 then
    raise exception 'too many orders right now' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.orders
     where source = 'web' and created_at >= clock_timestamp() - interval '1 minute'
  ) >= 15 then
    raise exception 'too many orders right now' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.orders
     where source = 'web' and created_at >= clock_timestamp() - interval '1 day'
  ) >= 400 then
    raise exception 'too many orders today' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.orders
     where customer_phone = v_phone and source = 'web'
       and created_at >= clock_timestamp() - interval '1 day'
  ) >= 8 then
    raise exception 'too many orders today for this phone' using errcode = 'P0001';
  end if;
  -- BLINDATURA: una prenotazione occupa il forno, quindi deve contenere
  -- almeno una pizza (senza, sfuggirebbe al conto della capienza); e per ogni
  -- giorno prenotabile ci sono al massimo sessanta prenotazioni web e tre
  -- ancora aperte per numero di telefono.
  if v_requested_ready_at is not null then
    if (
      select count(*) from public.orders
       where business_day_id = v_service.business_day_id
         and requested_ready_at is not null and source = 'web'
    ) >= 60 then
      raise exception 'too many bookings for that day' using errcode = 'P0001';
    end if;
    if (
      select count(*) from public.orders
       where customer_phone = v_phone and source = 'web'
         and requested_ready_at is not null
         and status in ('received', 'preparing', 'ready')
    ) >= 3 then
      raise exception 'too many open bookings for this phone' using errcode = 'P0001';
    end if;
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

    if v_product.product_type = 'pizza' then
      v_pizza_units := v_pizza_units + v_quantity;
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

  -- Il forno in quel quarto d'ora regge solo tante pizze quante infornate ci
  -- stanno. La riga del servizio e' bloccata (for update sopra): due
  -- prenotazioni per lo stesso quarto d'ora non superano mai insieme questo
  -- controllo.
  if v_requested_ready_at is not null and v_pizza_units < 1 then
    raise exception 'a booking needs at least one pizza' using errcode = '22023';
  end if;
  if v_requested_ready_at is not null and v_pizza_units > 0 then
    select coalesce(sum(item.quantity), 0) into v_slot_pizzas
      from public.orders ordine
      join public.order_items item on item.order_id = ordine.id
       and item.revision = (select max(revision) from public.order_items where order_id = ordine.id)
      join public.products product on product.id = item.product_id
     where ordine.service_id = v_service.id
       and ordine.status in ('received', 'preparing', 'ready')
       and ordine.requested_ready_at = v_requested_ready_at
       and product.product_type = 'pizza';

    v_slot_capacity := floor(15.0 / greatest(1, v_service.bake_minutes))::integer * greatest(1, v_service.oven_slots);
    if v_slot_capacity < 1 then
      v_slot_capacity := greatest(1, v_service.oven_slots);
    end if;
    if v_slot_pizzas + v_pizza_units > v_slot_capacity then
      raise exception 'requested time slot is full' using errcode = 'P0001';
    end if;
  end if;

  v_fee_rate := case v_payment_method when 'cash' then 0 else 0.02 end;
  v_fee := round(v_gross * v_fee_rate)::integer;

  begin
    v_sequence := public.next_order_sequence(v_service.business_day_id);
    insert into public.orders (
      id, business_day_id, service_id, client_request_token, request_fingerprint,
      sequence, source, status, customer_name, customer_phone, customer_email,
      payment_method, gross_cents, fee_cents, total_cents, eta_ready_at,
      requested_ready_at
    ) values (
      v_order_id, v_service.business_day_id, v_service.id, v_request_token, v_request_fingerprint,
      v_sequence, 'web', 'preparing', v_name, v_phone, v_email,
      v_payment_method, v_gross, v_fee, v_gross,
      coalesce(v_requested_ready_at, now() + interval '10 minutes'),
      v_requested_ready_at
    );
  exception when unique_violation then
    select orders.id, orders.request_fingerprint, orders.sequence, orders.status,
           orders.gross_cents, orders.fee_cents, orders.total_cents, orders.requested_ready_at,
           day.business_date
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
      'total_cents', v_existing.total_cents,
      'requested_ready_at', v_existing.requested_ready_at
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
    jsonb_build_object('source', 'web', 'sequence', v_sequence, 'service_id', v_service.id,
                       'requested_ready_at', v_requested_ready_at)
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'business_date', v_business_date,
    'sequence', v_sequence,
    'status', 'preparing',
    'gross_cents', v_gross,
    'fee_cents', v_fee,
    'total_cents', v_gross,
    'requested_ready_at', v_requested_ready_at
  );
end;
$$;

-- ---------- Funzioni riservate chiuse del tutto all'anonimo ----------------
revoke all on function public.set_bookings_enabled(boolean) from public, anon, authenticated;
grant execute on function public.set_bookings_enabled(boolean) to authenticated;
revoke all on function public.set_product_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.set_product_photo(uuid, text) to authenticated;
revoke all on function public.set_service_oven(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.set_service_oven(uuid, integer, integer, integer) to authenticated;
-- order_ready_minutes la usa solo il trigger (gira come proprietario): nessun
-- client la chiama, quindi nessuno la deve poter sondare.
revoke all on function public.order_ready_minutes(uuid) from public, anon, authenticated;

-- ---------- Tempo massimo per le query dell'anonimo -------------------------
-- Una richiesta anonima che dura piu' di tre secondi e' un attacco o un bug:
-- si tronca. In un blocco a parte: se il progetto non permette di toccare i
-- ruoli, il resto della migrazione passa lo stesso (e lo si fa a mano dal
-- pannello, vedi docs/sicurezza.md).
do $$
begin
  execute 'alter role anon set statement_timeout = ''3s''';
  execute 'alter role authenticated set statement_timeout = ''8s''';
exception when others then
  raise notice 'statement_timeout non impostato: %', sqlerrm;
end;
$$;

-- ---------- La vista degli slot guarda solo due settimane -------------------
drop view if exists public.public_booking_slots;
create view public.public_booking_slots with (security_barrier = true) as
select
  ordine.service_id,
  ordine.requested_ready_at,
  coalesce(sum(item.quantity) filter (where product.product_type = 'pizza'), 0)::integer as pizzas_booked
from public.orders ordine
join public.order_items item
  on item.order_id = ordine.id
 and item.revision = (select max(revision) from public.order_items where order_id = ordine.id)
join public.products product on product.id = item.product_id
where ordine.requested_ready_at is not null
  and ordine.requested_ready_at between now() - interval '1 day' and now() + interval '15 days'
  and ordine.status in ('received', 'preparing', 'ready')
group by ordine.service_id, ordine.requested_ready_at;

revoke all on table public.public_booking_slots from public, anon, authenticated;
grant select on table public.public_booking_slots to anon, authenticated;

-- ---------- Stripe: l'ordine si ritrova anche dal suo id ------------------
-- Se il cliente apre due volte il pagamento, la seconda sessione sostituisce la
-- prima sull'ordine; se poi paga la prima, il webhook non la trovava piu'. Ora
-- il webhook passa anche l'id dell'ordine (dai metadati della sessione).
drop function if exists public.mark_order_paid(text);
create or replace function public.mark_order_paid(p_session_id text, p_order_id uuid default null)
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
         paid_at = coalesce(paid_at, now()),
         stripe_session_id = coalesce(stripe_session_id, p_session_id)
   where (stripe_session_id = p_session_id or (p_order_id is not null and id = p_order_id))
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
revoke all on function public.mark_order_paid(text, uuid) from public, anon, authenticated;

-- ---------- Contatori per la Edge Function place-order -------------------
-- Un contatore per chiave (es. «ip:1.2.3.4:minute») e finestra: la funzione
-- sul server lo incrementa in una sola istruzione e rifiuta oltre il limite.
-- Solo il servizio la chiama; dal browser non esiste.
create table if not exists public.rate_buckets (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.rate_buckets enable row level security;
revoke all on table public.rate_buckets from public, anon, authenticated;

create or replace function public.rate_limit_hit(p_bucket text, p_limit integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_hits integer;
begin
  insert into public.rate_buckets (bucket, window_start, hits)
  values (p_bucket, clock_timestamp(), 1)
  on conflict (bucket) do update set
    hits = case when public.rate_buckets.window_start < clock_timestamp() - p_window then 1 else public.rate_buckets.hits + 1 end,
    window_start = case when public.rate_buckets.window_start < clock_timestamp() - p_window then clock_timestamp() else public.rate_buckets.window_start end
  returning hits into v_hits;
  -- Pulizia leggera: ogni tanto si buttano i contatori vecchi di un giorno.
  if random() < 0.01 then
    delete from public.rate_buckets where window_start < clock_timestamp() - interval '1 day';
  end if;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, interval) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, interval) to service_role;
