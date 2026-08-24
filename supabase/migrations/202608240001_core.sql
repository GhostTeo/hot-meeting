-- Hot Meeting core schema.
-- The frontend may use only the anon key. Privileged service-role credentials
-- belong in trusted server environments and are never required by this schema.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  product_type text not null check (product_type in ('pizza', 'drink')),
  price_cents integer not null check (price_cents > 0),
  photo_path text,
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_translations (
  product_id uuid not null references public.products(id) on delete cascade,
  locale text not null check (locale in ('it', 'en')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  manually_edited boolean not null default false,
  primary key (product_id, locale)
);

create table public.ingredients (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  additional_price_cents integer not null default 0 check (additional_price_cents >= 0),
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredient_translations (
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  locale text not null check (locale in ('it', 'en')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  manually_edited boolean not null default false,
  primary key (ingredient_id, locale)
);

create table public.product_ingredients (
  product_id uuid not null references public.products(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  is_included boolean not null default true,
  removable boolean not null default false,
  can_add boolean not null default false,
  max_quantity smallint not null default 1 check (max_quantity between 1 and 10),
  sort_order integer not null default 0,
  primary key (product_id, ingredient_id),
  check (not removable or is_included),
  check (is_included or can_add)
);

create table public.allergens (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label_it text not null,
  label_en text not null,
  eu_order smallint not null unique check (eu_order between 1 and 14)
);

create table public.product_allergens (
  product_id uuid not null references public.products(id) on delete cascade,
  allergen_id uuid not null references public.allergens(id) on delete restrict,
  primary key (product_id, allergen_id)
);

create table public.business_days (
  id uuid primary key default extensions.gen_random_uuid(),
  business_date date not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  next_sequence integer not null default 0 check (next_sequence >= 0),
  final_closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'closed') = (final_closed_at is not null))
);

create table public.services (
  id uuid primary key default extensions.gen_random_uuid(),
  business_day_id uuid not null references public.business_days(id) on delete restrict,
  shift text not null check (shift in ('lunch', 'dinner')),
  status text not null default 'closed' check (status in ('open', 'closed')),
  online_orders_enabled boolean not null default false,
  capacity_pizzas_hour integer not null default 90 check (capacity_pizzas_hour between 1 and 1000),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_day_id),
  unique (business_day_id, shift),
  check (status <> 'open' or opened_at is not null),
  check (status = 'open' or not online_orders_enabled)
);

create table public.service_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid,
  closed_by uuid,
  check (closed_at is null or closed_at >= opened_at)
);

create table public.closures (
  id uuid primary key default extensions.gen_random_uuid(),
  closure_type text not null check (closure_type in ('weekly', 'holiday', 'exceptional_opening')),
  weekday smallint check (weekday between 1 and 7),
  starts_on date,
  ends_on date,
  public_message text not null default '',
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (closure_type = 'weekly' and weekday is not null and starts_on is null and ends_on is null)
    or
    (closure_type in ('holiday', 'exceptional_opening') and weekday is null and starts_on is not null and ends_on is not null and starts_on <= ends_on)
  )
);

create table public.orders (
  id uuid primary key default extensions.gen_random_uuid(),
  business_day_id uuid not null references public.business_days(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  client_request_token uuid unique,
  request_fingerprint bytea,
  sequence integer not null check (sequence > 0),
  source text not null check (source in ('web', 'restaurant')),
  status text not null default 'preparing' check (status in ('received', 'preparing', 'ready', 'collected', 'cancelled')),
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 120),
  customer_phone text not null check (char_length(customer_phone) between 6 and 20),
  customer_email text check (customer_email is null or char_length(customer_email) <= 254),
  payment_method text not null check (payment_method in ('cash', 'apple_pay', 'google_pay')),
  gross_cents integer not null check (gross_cents >= 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  eta_ready_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_day_id, sequence),
  foreign key (service_id, business_day_id) references public.services (id, business_day_id) on delete restrict,
  check (total_cents = gross_cents),
  check (
    (source = 'web' and client_request_token is not null and request_fingerprint is not null)
    or
    (source = 'restaurant' and client_request_token is null and request_fingerprint is null)
  )
);

create table public.order_items (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  unit_price_cents integer not null check (unit_price_cents > 0),
  quantity smallint not null check (quantity between 1 and 20),
  total_price_cents integer not null check (total_price_cents > 0),
  allergens_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(allergens_snapshot) = 'array'),
  note text not null default '' check (char_length(note) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (total_price_cents = unit_price_cents * quantity)
);

create table public.order_item_changes (
  id uuid primary key default extensions.gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  change_type text not null check (change_type in ('removed', 'addition')),
  ingredient_name_snapshot text not null,
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  quantity smallint not null default 1 check (quantity between 1 and 10),
  created_at timestamptz not null default now(),
  unique (order_item_id, ingredient_id, change_type),
  check ((change_type = 'removed' and unit_price_cents = 0 and quantity = 1) or change_type = 'addition')
);

create table public.order_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  revision integer not null check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  gross_cents integer not null check (gross_cents >= 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  reason text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (order_id, revision),
  check (total_cents = gross_cents)
);

alter table public.order_items
  add constraint order_items_revision_fk
  foreign key (order_id, revision)
  references public.order_revisions (order_id, revision)
  on delete restrict;

create table public.payment_adjustments (
  id uuid primary key default extensions.gen_random_uuid(),
  adjustment_group_id uuid not null,
  version integer not null check (version > 0),
  supersedes_id uuid unique references public.payment_adjustments(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('supplement', 'refund')),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'recorded', 'cancelled')),
  payment_method text check (payment_method is null or payment_method in ('cash', 'apple_pay', 'google_pay')),
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (adjustment_group_id, version),
  check (
    (version = 1 and supersedes_id is null)
    or (version > 1 and supersedes_id is not null)
  )
);

create table public.events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('public', 'creator', 'system')),
  action text not null check (char_length(action) between 1 and 100),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid,
  business_day_id uuid references public.business_days(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index products_available_sort_idx on public.products (sort_order, id) where available;
create index product_ingredients_ingredient_idx on public.product_ingredients (ingredient_id, product_id);
create index product_allergens_allergen_idx on public.product_allergens (allergen_id, product_id);
create index services_status_idx on public.services (status, online_orders_enabled, business_day_id);
create index service_sessions_service_opened_idx on public.service_sessions (service_id, opened_at desc);
create index closures_dates_idx on public.closures (starts_on, ends_on) where enabled;
create index orders_business_day_status_idx on public.orders (business_day_id, status, created_at desc);
create index orders_service_status_idx on public.orders (service_id, status, created_at);
create index orders_customer_phone_created_idx on public.orders (customer_phone, created_at desc);
create index order_items_order_idx on public.order_items (order_id, revision desc, sort_order);
create index order_item_changes_item_idx on public.order_item_changes (order_item_id);
create index order_revisions_order_idx on public.order_revisions (order_id, revision desc);
create index payment_adjustments_order_idx on public.payment_adjustments (order_id, adjustment_group_id, version desc);
create index events_business_day_created_idx on public.events (business_day_id, created_at desc);
create index events_entity_created_idx on public.events (entity_type, entity_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_touch_updated_at before update on public.products
for each row execute function public.touch_updated_at();
create trigger ingredients_touch_updated_at before update on public.ingredients
for each row execute function public.touch_updated_at();
create trigger business_days_touch_updated_at before update on public.business_days
for each row execute function public.touch_updated_at();
create trigger services_touch_updated_at before update on public.services
for each row execute function public.touch_updated_at();
create trigger closures_touch_updated_at before update on public.closures
for each row execute function public.touch_updated_at();
create trigger orders_touch_updated_at before update on public.orders
for each row execute function public.touch_updated_at();

create or replace function public.prevent_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'events are append-only';
end;
$$;

create trigger events_are_append_only
before update or delete on public.events
for each row execute function public.prevent_event_mutation();

create or replace function public.prevent_order_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'orders cannot be deleted';
end;
$$;

create trigger orders_preserve_history
before delete on public.orders
for each row execute function public.prevent_order_delete();

create or replace function public.protect_order_history()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if row(
    old.business_day_id, old.service_id, old.client_request_token, old.request_fingerprint,
    old.sequence, old.source, old.customer_name, old.customer_phone, old.customer_email,
    old.payment_method, old.gross_cents, old.fee_cents, old.total_cents,
    old.created_by, old.created_at
  ) is distinct from row(
    new.business_day_id, new.service_id, new.client_request_token, new.request_fingerprint,
    new.sequence, new.source, new.customer_name, new.customer_phone, new.customer_email,
    new.payment_method, new.gross_cents, new.fee_cents, new.total_cents,
    new.created_by, new.created_at
  ) then
    raise exception 'historical order fields cannot be overwritten';
  end if;
  return new;
end;
$$;

create trigger orders_protect_history
before update on public.orders
for each row execute function public.protect_order_history();

create or replace function public.prevent_historical_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'historical order records are append-only';
end;
$$;

create trigger order_items_are_append_only
before update or delete on public.order_items
for each row execute function public.prevent_historical_mutation();
create trigger order_item_changes_are_append_only
before update or delete on public.order_item_changes
for each row execute function public.prevent_historical_mutation();
create trigger order_revisions_are_append_only
before update or delete on public.order_revisions
for each row execute function public.prevent_historical_mutation();
create trigger payment_adjustments_are_append_only
before update or delete on public.payment_adjustments
for each row execute function public.prevent_historical_mutation();

create or replace function public.prevent_service_close_with_active_orders()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.status = 'open'
     and new.status = 'closed'
     and exists (
       select 1
         from public.orders
        where service_id = new.id
          and status in ('received', 'preparing')
     ) then
    raise exception 'service has active orders';
  end if;
  return new;
end;
$$;

create trigger services_require_empty_queue
before update of status on public.services
for each row execute function public.prevent_service_close_with_active_orders();

create or replace function public.is_creator()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'creator';
$$;

create or replace function public.next_order_sequence(p_business_day uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_sequence integer;
begin
  update public.business_days
     set next_sequence = next_sequence + 1
   where id = p_business_day
     and status = 'open'
  returning next_sequence into v_sequence;

  if v_sequence is null then
    raise exception 'business day is not open' using errcode = 'P0001';
  end if;

  return v_sequence;
end;
$$;

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
$$;

create or replace function public.build_server_order_items(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_change jsonb;
  v_product public.products%rowtype;
  v_relation record;
  v_product_id uuid;
  v_ingredient_id uuid;
  v_quantity integer;
  v_change_quantity integer;
  v_total_units integer := 0;
  v_product_name text;
  v_note text;
  v_unit_price integer;
  v_gross integer := 0;
  v_allergens jsonb;
  v_server_items jsonb := '[]'::jsonb;
  v_server_changes jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'an order must contain between 1 and 20 items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
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

    select * into v_product
      from public.products
     where id = v_product_id and available
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
             jsonb_agg(jsonb_build_object(
               'id', allergen.id, 'label_it', allergen.label_it, 'label_en', allergen.label_en
             ) order by allergen.eu_order),
             '[]'::jsonb
           ) into v_allergens
      from public.product_allergens product_allergen
      join public.allergens allergen on allergen.id = product_allergen.allergen_id
     where product_allergen.product_id = v_product.id;

    v_unit_price := v_product.price_cents;
    v_server_changes := '[]'::jsonb;
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
      select relation.is_included, relation.removable, relation.can_add, relation.max_quantity,
             ingredient.available, ingredient.additional_price_cents,
             coalesce(name_it.name, ingredient.slug) as name_it,
             coalesce(name_en.name, name_it.name, ingredient.slug) as name_en
        into v_relation
        from public.product_ingredients relation
        join public.ingredients ingredient on ingredient.id = relation.ingredient_id
        left join public.ingredient_translations name_it
          on name_it.ingredient_id = ingredient.id and name_it.locale = 'it'
        left join public.ingredient_translations name_en
          on name_en.ingredient_id = ingredient.id and name_en.locale = 'en'
       where relation.product_id = v_product.id
         and relation.ingredient_id = v_ingredient_id
       for share of relation, ingredient;
      if not found or not v_relation.available then
        raise exception 'ingredient is unavailable for this product' using errcode = '22023';
      end if;
      if v_change ->> 'type' = 'removed' then
        if not v_relation.is_included or not v_relation.removable or v_change_quantity <> 1 then
          raise exception 'ingredient cannot be removed' using errcode = '22023';
        end if;
      else
        if not v_relation.can_add or v_change_quantity > v_relation.max_quantity then
          raise exception 'ingredient addition exceeds its allowed quantity' using errcode = '22023';
        end if;
        v_unit_price := v_unit_price + (v_relation.additional_price_cents * v_change_quantity);
      end if;
      v_server_changes := v_server_changes || jsonb_build_array(jsonb_build_object(
        'type', v_change ->> 'type', 'ingredient_id', v_ingredient_id,
        'name_it', v_relation.name_it, 'name_en', v_relation.name_en,
        'unit_price_cents', case when v_change ->> 'type' = 'addition' then v_relation.additional_price_cents else 0 end,
        'quantity', v_change_quantity
      ));
    end loop;

    v_gross := v_gross + (v_unit_price * v_quantity);
    v_server_items := v_server_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'product_type', v_product.product_type,
      'name_it', v_product_name, 'unit_price_cents', v_unit_price,
      'quantity', v_quantity, 'total_price_cents', v_unit_price * v_quantity,
      'note', v_note, 'changes', v_server_changes, 'allergens', v_allergens
    ));
  end loop;
  return jsonb_build_object('items', v_server_items, 'gross_cents', v_gross);
end;
$$;

create or replace function public.insert_order_revision_items(
  p_order_id uuid,
  p_revision integer,
  p_server_items jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_change jsonb;
  v_order_item_id uuid;
  v_sort_order integer := 0;
begin
  for v_item in select value from jsonb_array_elements(p_server_items) loop
    v_sort_order := v_sort_order + 1;
    v_order_item_id := extensions.gen_random_uuid();
    insert into public.order_items (
      id, order_id, revision, product_id, product_name_snapshot, unit_price_cents,
      quantity, total_price_cents, allergens_snapshot, note, sort_order
    ) values (
      v_order_item_id, p_order_id, p_revision, (v_item ->> 'product_id')::uuid,
      v_item ->> 'name_it', (v_item ->> 'unit_price_cents')::integer,
      (v_item ->> 'quantity')::integer, (v_item ->> 'total_price_cents')::integer,
      v_item -> 'allergens', v_item ->> 'note', v_sort_order
    );
    for v_change in select value from jsonb_array_elements(v_item -> 'changes') loop
      insert into public.order_item_changes (
        order_item_id, ingredient_id, change_type, ingredient_name_snapshot,
        unit_price_cents, quantity
      ) values (
        v_order_item_id, (v_change ->> 'ingredient_id')::uuid, v_change ->> 'type',
        v_change ->> 'name_it', (v_change ->> 'unit_price_cents')::integer,
        (v_change ->> 'quantity')::integer
      );
    end loop;
  end loop;
end;
$$;

create or replace function public.create_restaurant_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
  if v_phone !~ '^(\+39)?(?:3[0-9]{9}|0[0-9]{5,10})$' then
    raise exception 'invalid Italian phone number' using errcode = '22023';
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
$$;

create or replace function public.revise_order(
  p_order_id uuid,
  p_items jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_order public.orders%rowtype;
  v_business_date date;
  v_revision integer;
  v_actor_id uuid := nullif(auth.jwt() ->> 'sub', '')::uuid;
  v_priced jsonb;
  v_server_items jsonb;
  v_snapshot jsonb;
  v_gross integer;
  v_fee integer;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;
  if octet_length(coalesce(p_items, 'null'::jsonb)::text) > 32768 then
    raise exception 'items exceed 32768 bytes' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'revision reason must be between 1 and 500 characters' using errcode = '22023';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;
  if not found then
    raise exception 'order not found' using errcode = '22023';
  end if;
  if v_order.status in ('collected', 'cancelled') then
    raise exception 'terminal order cannot be revised' using errcode = '22023';
  end if;
  perform 1 from public.services
   where id = v_order.service_id and status = 'open'
   for share;
  if not found then
    raise exception 'order service is not open' using errcode = 'P0001';
  end if;
  select business_date into v_business_date
    from public.business_days
   where id = v_order.business_day_id and status = 'open';
  if not found then
    raise exception 'business day is not open' using errcode = 'P0001';
  end if;

  select coalesce(max(revision), 0) + 1
    into v_revision
    from public.order_revisions
   where order_id = p_order_id;

  v_priced := public.build_server_order_items(p_items);
  v_server_items := v_priced -> 'items';
  v_gross := (v_priced ->> 'gross_cents')::integer;
  v_fee := case when v_order.payment_method = 'cash' then 0 else round(v_gross * 0.02)::integer end;
  v_snapshot := jsonb_build_object(
    'schema_version', 1, 'business_day_id', v_order.business_day_id,
    'business_date', v_business_date, 'service_id', v_order.service_id,
    'customer', jsonb_build_object(
      'name', v_order.customer_name, 'phone', v_order.customer_phone, 'email', v_order.customer_email
    ),
    'payment_method', v_order.payment_method, 'items', v_server_items,
    'gross_cents', v_gross, 'fee_cents', v_fee, 'total_cents', v_gross
  );
  insert into public.order_revisions (
    order_id, revision, snapshot, gross_cents, fee_cents, total_cents, reason, created_by
  ) values (
    p_order_id, v_revision, v_snapshot, v_gross, v_fee, v_gross, btrim(p_reason), v_actor_id
  );
  perform public.insert_order_revision_items(p_order_id, v_revision, v_server_items);

  insert into public.events (
    actor_id, actor_kind, action, entity_type, entity_id, business_day_id, metadata
  ) values (
    v_actor_id, 'creator', 'order.revised', 'order', p_order_id, v_order.business_day_id,
    jsonb_build_object(
      'revision', v_revision, 'reason', btrim(p_reason),
      'previous_gross_cents', (
        select gross_cents from public.order_revisions
         where order_id = p_order_id and revision = v_revision - 1
      ),
      'gross_cents', v_gross
    )
  );

  return jsonb_build_object(
    'order_id', p_order_id, 'revision', v_revision, 'gross_cents', v_gross,
    'fee_cents', v_fee, 'total_cents', v_gross
  );
end;
$$;

create or replace function public.record_payment_adjustment(
  p_order_id uuid,
  p_adjustment_type text,
  p_amount_cents integer,
  p_status text,
  p_payment_method text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_adjustment_id uuid := extensions.gen_random_uuid();
  v_business_day_id uuid;
  v_actor_id uuid := nullif(auth.jwt() ->> 'sub', '')::uuid;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;
  if p_adjustment_type is null or p_adjustment_type not in ('supplement', 'refund') then
    raise exception 'invalid adjustment type' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'adjustment amount must be positive' using errcode = '22023';
  end if;
  if p_status is distinct from 'pending' then
    raise exception 'new adjustment status must be pending' using errcode = '22023';
  end if;
  if p_payment_method is not null and p_payment_method not in ('cash', 'apple_pay', 'google_pay') then
    raise exception 'invalid payment method' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'adjustment note exceeds 500 characters' using errcode = '22023';
  end if;

  select business_day_id
    into v_business_day_id
    from public.orders
   where id = p_order_id
   for share;
  if not found then
    raise exception 'order not found' using errcode = '22023';
  end if;

  insert into public.payment_adjustments (
    id, adjustment_group_id, version, supersedes_id, order_id, adjustment_type,
    amount_cents, status, payment_method, note, created_by
  ) values (
    v_adjustment_id, v_adjustment_id, 1, null, p_order_id, p_adjustment_type,
    p_amount_cents, 'pending', p_payment_method, coalesce(p_note, ''), v_actor_id
  );

  insert into public.events (
    actor_id, actor_kind, action, entity_type, entity_id, business_day_id, metadata
  ) values (
    v_actor_id, 'creator', 'payment.adjustment-created', 'order', p_order_id, v_business_day_id,
    jsonb_build_object(
      'adjustment_group_id', v_adjustment_id,
      'type', p_adjustment_type,
      'amount_cents', p_amount_cents,
      'status', 'pending',
      'version', 1
    )
  );

  return v_adjustment_id;
end;
$$;

create or replace function public.transition_payment_adjustment(
  p_adjustment_id uuid,
  p_target_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current public.payment_adjustments%rowtype;
  v_new_id uuid := extensions.gen_random_uuid();
  v_business_day_id uuid;
  v_actor_id uuid := nullif(auth.jwt() ->> 'sub', '')::uuid;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;
  if p_target_status is null or p_target_status not in ('recorded', 'cancelled') then
    raise exception 'target status must be recorded or cancelled' using errcode = '22023';
  end if;

  select * into v_current
    from public.payment_adjustments
   where adjustment_group_id = p_adjustment_id
   order by version desc
   limit 1
   for update;
  if not found then
    raise exception 'payment adjustment not found' using errcode = '22023';
  end if;
  if v_current.status <> 'pending' then
    raise exception 'current status must be pending' using errcode = '22023';
  end if;

  select business_day_id into v_business_day_id
    from public.orders where id = v_current.order_id;
  insert into public.payment_adjustments (
    id, adjustment_group_id, version, supersedes_id, order_id, adjustment_type,
    amount_cents, status, payment_method, note, created_by
  ) values (
    v_new_id, v_current.adjustment_group_id, v_current.version + 1, v_current.id,
    v_current.order_id, v_current.adjustment_type, v_current.amount_cents,
    p_target_status, v_current.payment_method, v_current.note, v_actor_id
  );
  insert into public.events (
    actor_id, actor_kind, action, entity_type, entity_id, business_day_id, metadata
  ) values (
    v_actor_id, 'creator', 'payment.adjustment-transitioned', 'order',
    v_current.order_id, v_business_day_id,
    jsonb_build_object(
      'adjustment_group_id', v_current.adjustment_group_id,
      'from_status', v_current.status,
      'to_status', p_target_status,
      'version', v_current.version + 1
    )
  );
  return v_new_id;
end;
$$;

-- These security-invoker views are the operational read models. Earlier
-- revisions remain immutable while kitchens and reports resolve only the
-- latest complete version.
create view public.current_order_items
with (security_barrier = true, security_invoker = true) as
select item.*
from public.order_items item
where item.revision = (
  select max(revision)
  from public.order_revisions revision
  where revision.order_id = item.order_id
);

create view public.current_order_item_changes
with (security_barrier = true, security_invoker = true) as
select change.*
from public.order_item_changes change
join public.current_order_items item on item.id = change.order_item_id;

create view public.current_order_totals
with (security_barrier = true, security_invoker = true) as
select distinct on (revision.order_id)
  revision.order_id,
  revision.revision,
  revision.gross_cents,
  revision.fee_cents,
  revision.total_cents,
  revision.created_at
from public.order_revisions revision
order by revision.order_id, revision.revision desc;

create view public.current_payment_adjustments
with (security_barrier = true, security_invoker = true) as
select distinct on (adjustment.adjustment_group_id)
  adjustment.id,
  adjustment.adjustment_group_id,
  adjustment.version,
  adjustment.supersedes_id,
  adjustment.order_id,
  adjustment.adjustment_type,
  adjustment.amount_cents,
  adjustment.status,
  adjustment.payment_method,
  adjustment.note,
  adjustment.created_by,
  adjustment.created_at
from public.payment_adjustments adjustment
order by adjustment.adjustment_group_id, adjustment.version desc;

-- Public views deliberately expose only the columns needed by the customer UI.
-- The underlying service/calendar tables remain Creator-only.
create view public.public_opening_status with (security_barrier = true) as
select
  service.id as service_id,
  day.business_date,
  service.shift,
  service.status,
  service.online_orders_enabled,
  service.opened_at,
  service.closed_at
from public.services service
join public.business_days day on day.id = service.business_day_id
where day.status = 'open';

create view public.public_closure_calendar with (security_barrier = true) as
select closure_type, weekday, starts_on, ends_on, public_message
from public.closures
where enabled;

alter table public.products enable row level security;
alter table public.product_translations enable row level security;
alter table public.ingredients enable row level security;
alter table public.ingredient_translations enable row level security;
alter table public.product_ingredients enable row level security;
alter table public.allergens enable row level security;
alter table public.product_allergens enable row level security;
alter table public.business_days enable row level security;
alter table public.services enable row level security;
alter table public.service_sessions enable row level security;
alter table public.closures enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_changes enable row level security;
alter table public.order_revisions enable row level security;
alter table public.payment_adjustments enable row level security;
alter table public.events enable row level security;

create policy products_public_read on public.products
for select to anon, authenticated using (available);
create policy products_creator_access on public.products
for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy product_translations_public_read on public.product_translations
for select to anon, authenticated using (
  exists (select 1 from public.products product where product.id = product_id and product.available)
);
create policy product_translations_creator_access on public.product_translations
for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy ingredients_public_read on public.ingredients
for select to anon, authenticated using (available);
create policy ingredients_creator_access on public.ingredients
for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy ingredient_translations_public_read on public.ingredient_translations
for select to anon, authenticated using (
  exists (select 1 from public.ingredients ingredient where ingredient.id = ingredient_id and ingredient.available)
);
create policy ingredient_translations_creator_access on public.ingredient_translations
for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy product_ingredients_public_read on public.product_ingredients
for select to anon, authenticated using (
  exists (select 1 from public.products product where product.id = product_id and product.available)
  and exists (select 1 from public.ingredients ingredient where ingredient.id = ingredient_id and ingredient.available)
);
create policy product_ingredients_creator_access on public.product_ingredients
for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy allergens_public_read on public.allergens
for select to anon, authenticated using (true);
create policy allergens_creator_access on public.allergens
for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy product_allergens_public_read on public.product_allergens
for select to anon, authenticated using (
  exists (select 1 from public.products product where product.id = product_id and product.available)
);
create policy product_allergens_creator_access on public.product_allergens
for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy business_days_creator_access on public.business_days
for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy services_creator_access on public.services
for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy service_sessions_creator_access on public.service_sessions
for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy closures_creator_access on public.closures
for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy orders_creator_access on public.orders
for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy order_items_creator_access on public.order_items
for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy order_item_changes_creator_access on public.order_item_changes
for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy order_revisions_creator_access on public.order_revisions
for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy payment_adjustments_creator_access on public.payment_adjustments
for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy events_creator_read on public.events
for select to authenticated using (public.is_creator());
create policy events_creator_insert on public.events
for insert to authenticated with check (public.is_creator());

revoke all on table public.orders from anon;
revoke all on table public.events from anon;
revoke all on table public.order_items, public.order_item_changes, public.order_revisions, public.payment_adjustments from anon;
revoke all on table public.business_days, public.services, public.service_sessions, public.closures from anon;
revoke all on table public.public_opening_status, public.public_closure_calendar from public, anon, authenticated;
revoke all on table public.current_order_items, public.current_order_item_changes,
  public.current_order_totals, public.current_payment_adjustments from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on table public.products, public.product_translations, public.ingredients,
  public.ingredient_translations, public.product_ingredients, public.allergens,
  public.product_allergens to anon, authenticated;
grant select on table public.public_opening_status, public.public_closure_calendar to anon, authenticated;
grant select on table public.current_order_items, public.current_order_item_changes,
  public.current_order_totals, public.current_payment_adjustments to authenticated;

grant select, insert, update, delete on table public.products, public.product_translations,
  public.ingredients, public.ingredient_translations, public.product_ingredients,
  public.allergens, public.product_allergens, public.business_days, public.services,
  public.service_sessions, public.closures, public.orders to authenticated;
grant select on table public.order_items, public.order_item_changes,
  public.order_revisions, public.payment_adjustments to authenticated;
grant select, insert on table public.events to authenticated;
revoke delete on table public.orders from authenticated;
revoke insert on table public.orders from authenticated;
revoke insert, update, delete on table public.order_items, public.order_item_changes,
  public.order_revisions, public.payment_adjustments from authenticated;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_event_mutation() from public, anon, authenticated;
revoke all on function public.prevent_order_delete() from public, anon, authenticated;
revoke all on function public.protect_order_history() from public, anon, authenticated;
revoke all on function public.prevent_historical_mutation() from public, anon, authenticated;
revoke all on function public.prevent_service_close_with_active_orders() from public, anon, authenticated;
revoke all on function public.is_creator() from public, anon, authenticated;
grant execute on function public.is_creator() to authenticated;
revoke all on function public.next_order_sequence(uuid) from public, anon, authenticated;
revoke all on function public.create_public_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_public_order(jsonb) to anon, authenticated;
revoke all on function public.build_server_order_items(jsonb) from public, anon, authenticated;
revoke all on function public.insert_order_revision_items(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.create_restaurant_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_restaurant_order(jsonb) to authenticated;
revoke all on function public.revise_order(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.revise_order(uuid, jsonb, text) to authenticated;
revoke all on function public.record_payment_adjustment(uuid, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.record_payment_adjustment(uuid, text, integer, text, text, text) to authenticated;
revoke all on function public.transition_payment_adjustment(uuid, text) from public, anon, authenticated;
grant execute on function public.transition_payment_adjustment(uuid, text) to authenticated;

comment on function public.create_public_order(jsonb) is
  'Creates a public web order after validating service, catalog, customization and all prices server-side.';
comment on function public.create_restaurant_order(jsonb) is
  'Creator-only atomic restaurant order creation with server-derived prices and snapshots.';
comment on function public.revise_order(uuid, jsonb, text) is
  'Creator-only append channel for versioned kitchen items, totals and immutable revision history.';
comment on function public.record_payment_adjustment(uuid, text, integer, text, text, text) is
  'Creator-only creation of immutable pending payment adjustments.';
comment on function public.transition_payment_adjustment(uuid, text) is
  'Creator-only pending-to-terminal transition that appends an immutable adjustment version.';
comment on table public.events is
  'Append-only operational audit log. Reports use indexed transactional tables instead.';
