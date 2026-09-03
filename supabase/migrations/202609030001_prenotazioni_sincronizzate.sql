-- Le prenotazioni, sul serio: sincronizzate fra tutte le postazioni e con un
-- forno che non promette piu' pizze di quante ne possa davvero sfornare.
--
-- Fino a qui "Prenotazioni attive/sospese" viveva solo nel browser di chi lo
-- toccava: un altro telefono in pizzeria vedeva un altro stato. E l'orario
-- richiesto dal cliente restava solo lato client, mai scritto sul server: la
-- cucina lo vedeva scritto in chiaro nel nome del cliente, non come dato vero.
--
-- Qui la prenotazione diventa una colonna sull'ordine (requested_ready_at) e
-- l'interruttore diventa una colonna sul servizio (bookings_enabled), esattamente
-- come "online_orders_enabled" gia' fa per gli ordini immediati: stesso schema,
-- stesse regole, stessa strada per arrivare a tutti i dispositivi.
--
-- Il forno non e' infinito: un quarto d'ora regge solo tante infornate quante
-- gliene stanno (oven_slots pizze ogni bake_minutes, arrotondato per difetto).
-- Se uno slot e' gia' pieno, non compare fra quelli prenotabili e, se qualcuno
-- ci arriva comunque (due persone che prenotano nello stesso istante), il
-- server lo rifiuta invece di promettere una pizza che non puo' uscire in
-- tempo. Il controllo vive nella stessa transazione che gia' blocca la riga
-- del servizio (v_service ... for update), quindi due prenotazioni per lo
-- stesso quarto d'ora non possono mai passare insieme per sbaglio.

-- ---------- Il servizio: un secondo interruttore, sincronizzato -----------

alter table public.services
  add column if not exists bookings_enabled boolean not null default false;

alter table public.services drop constraint if exists services_bookings_enabled_status_check;
alter table public.services add constraint services_bookings_enabled_status_check
  check (status = 'open' or not bookings_enabled);

create index if not exists services_bookings_idx
  on public.services (status, bookings_enabled, business_day_id);

-- ---------- L'ordine: quando deve essere pronto, non solo quando e' nato ----

alter table public.orders
  add column if not exists requested_ready_at timestamptz;

alter table public.orders drop constraint if exists orders_requested_ready_at_quarter_check;
alter table public.orders add constraint orders_requested_ready_at_quarter_check
  check (
    requested_ready_at is null
    or (extract(minute from requested_ready_at)::integer % 15 = 0
        and extract(second from requested_ready_at) = 0)
  );

create index if not exists orders_service_requested_ready_idx
  on public.orders (service_id, requested_ready_at)
  where requested_ready_at is not null;

-- ---------- Il trigger dell'attesa: una prenotazione tiene il suo orario ----
-- Stessa funzione di 202608250004_oven_timing.sql, con un solo ramo in piu' in
-- testa: se l'ordine ha un orario richiesto, e' quello il traguardo, non la
-- coda del forno. Il resto (calcolo per gli ordini immediati) resta identico.

create or replace function public.apply_order_eta()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_minutes integer;
  v_requested timestamptz;
begin
  -- Solo alla nascita dell'ordine: una revisione successiva non deve spostare
  -- un orario gia' promesso a chi sta aspettando.
  if new.revision <> 1 then
    return null;
  end if;

  select requested_ready_at into v_requested from public.orders where id = new.order_id;
  if v_requested is not null then
    update public.orders
       set eta_ready_at = v_requested
     where id = new.order_id
       and eta_ready_at is distinct from v_requested;
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

-- ---------- L'interruttore delle prenotazioni, come quello dell'online -----

create or replace function public.set_service_bookings(
  p_service_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_service public.services%rowtype;
  v_day public.business_days%rowtype;
  v_actor_id uuid;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;
  select service.* into v_service from public.services service
   where service.id = p_service_id for update;
  if not found then
    raise exception 'service not found' using errcode = '22023';
  end if;
  if v_service.status <> 'open' and coalesce(p_enabled, false) then
    raise exception 'closed service cannot accept bookings' using errcode = 'P0001';
  end if;
  begin
    v_actor_id := nullif(auth.jwt() ->> 'sub', '')::uuid;
  exception when invalid_text_representation then
    v_actor_id := null;
  end;
  update public.services set bookings_enabled = coalesce(p_enabled, false)
   where id = p_service_id returning * into v_service;
  select * into v_day from public.business_days where id = v_service.business_day_id;
  insert into public.events (
    actor_id, actor_kind, action, entity_type, entity_id, business_day_id, metadata
  ) values (
    v_actor_id, 'creator', 'service.bookings-changed', 'service', v_service.id,
    v_service.business_day_id, jsonb_build_object('enabled', v_service.bookings_enabled)
  );
  return jsonb_build_object(
    'business_day_id', v_day.id, 'business_date', v_day.business_date,
    'business_day_status', v_day.status, 'service_id', v_service.id,
    'shift', v_service.shift, 'status', v_service.status,
    'online_orders_enabled', v_service.online_orders_enabled,
    'bookings_enabled', v_service.bookings_enabled,
    'capacity_pizzas_hour', v_service.capacity_pizzas_hour,
    'opened_at', v_service.opened_at, 'closed_at', v_service.closed_at
  );
end;
$$;

revoke all on function public.set_service_bookings(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_service_bookings(uuid, boolean) to authenticated;

-- ---------- create_public_order: accetta un orario richiesto -----------
-- Stessa funzione di 202608240001_core.sql, con queste aggiunte (segnate coi
-- commenti "PRENOTAZIONE:" per ritrovarle facilmente):
--  - "requested_ready_at" nella whitelist delle chiavi accettate.
--  - lettura, arrotondamento al minuto e controlli sull'orario richiesto.
--  - il servizio si sceglie con "bookings_enabled" quando c'e' un orario
--    richiesto, con "online_orders_enabled" quando non c'e' (invariato).
--  - le pizze dell'ordine si contano mentre si validano gli articoli.
--  - un controllo di capienza sul quarto d'ora richiesto, prima di scrivere
--    l'ordine: se il forno in quel quarto d'ora e' gia' pieno, l'ordine non
--    parte (lo stesso errore che il client sa gia' leggere e tradurre).
--  - l'ordine nasce con requested_ready_at e, se presente, eta_ready_at parte
--    gia' uguale (il trigger sopra lo conferma appena arrivano le righe).
-- Tutto il resto — validazione cliente, catalogo, prezzo, idempotenza, righe,
-- eventi — e' identico a prima, verbatim.

create or replace function public.create_public_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
  -- PRENOTAZIONE: nuove variabili.
  v_requested_ready_at timestamptz;
  v_pizza_units integer := 0;
  v_slot_pizzas integer;
  v_slot_capacity integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(payload::text) > 32768 then
    raise exception 'payload exceeds 32768 bytes' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(payload) as payload_key(key)
    -- PRENOTAZIONE: nuova chiave accettata in cima al payload.
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
  -- troppo lontano da diventare una promessa vuota.
  if payload ? 'requested_ready_at' and coalesce(payload ->> 'requested_ready_at', '') <> '' then
    begin
      v_requested_ready_at := (payload ->> 'requested_ready_at')::timestamptz;
    exception when invalid_text_representation then
      raise exception 'requested_ready_at must be a timestamp' using errcode = '22023';
    end;
    v_requested_ready_at := date_trunc('minute', v_requested_ready_at);
    if v_requested_ready_at <= clock_timestamp() + interval '5 minutes' then
      raise exception 'requested_ready_at must be far enough in the future' using errcode = '22023';
    end if;
    if v_requested_ready_at > clock_timestamp() + interval '6 hours' then
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

  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'customer name is required' using errcode = '22023';
  end if;
  if v_phone !~ '^(\+39)?(?:3[0-9]{9}|0[0-9]{5,10})$' then
    raise exception 'invalid Italian phone number' using errcode = '22023';
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
    -- PRENOTAZIONE: entra nell'impronta, cosi' lo stesso gettone con un
    -- orario diverso non viene scambiato per una richiesta identica.
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

  -- PRENOTAZIONE: un ordine immediato chiede online_orders_enabled come
  -- sempre; un ordine prenotato chiede bookings_enabled, un interruttore
  -- separato che puo' restare acceso anche a ordine immediato sospeso.
  select *
    into v_service
    from public.services
   where id = v_service_id
     and status = 'open'
     and (
       (v_requested_ready_at is null and online_orders_enabled)
       or (v_requested_ready_at is not null and bookings_enabled)
     )
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

    -- PRENOTAZIONE: solo le pizze occupano il forno, come nel calcolo
    -- dell'attesa immediata (order_ready_minutes) e nella coda pubblica.
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

  -- PRENOTAZIONE: il forno in quel quarto d'ora regge solo tante pizze quante
  -- infornate ci stanno. Si conta chi ha gia' prenotato lo stesso istante (le
  -- altre prenotazioni, non gli ordini immediati: quelli si mettono in coda
  -- quando arriva il loro momento, non prima). La riga del servizio e' gia'
  -- bloccata (for update sopra): due prenotazioni per lo stesso quarto d'ora
  -- non possono mai superare insieme questo controllo.
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
      -- PRENOTAZIONE: se c'e' un orario richiesto parte gia' da li', non dal
      -- solito segnaposto di dieci minuti (il trigger lo confermera' appena
      -- arrivano le righe dell'ordine).
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

-- Nessun nuovo revoke/grant qui: la firma non cambia (resta jsonb -> jsonb),
-- quindi i permessi gia' dati in 202608240001_core.sql restano quelli buoni.

-- ---------- Cosa vede chi non e' collegato: interruttore e slot pieni ------

drop view if exists public.public_opening_status;
create view public.public_opening_status with (security_barrier = true) as
select
  service.id as service_id,
  day.business_date,
  service.shift,
  service.status,
  service.online_orders_enabled,
  service.bookings_enabled,
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

-- Quante pizze sono gia' prenotate per ogni quarto d'ora: nessun nome, nessun
-- telefono, nessun ordine. Con questo e con le impostazioni del forno il menu
-- puo' nascondere da solo gli orari gia' pieni, con la stessa formula che
-- create_public_order usa per rifiutarli.
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
join public.services service on service.id = ordine.service_id
join public.business_days day on day.id = service.business_day_id
where ordine.requested_ready_at is not null
  and ordine.status in ('received', 'preparing', 'ready')
  and service.status = 'open'
  and day.status = 'open'
group by ordine.service_id, ordine.requested_ready_at;

revoke all on table public.public_booking_slots from public, anon, authenticated;
grant select on table public.public_booking_slots to anon, authenticated;
