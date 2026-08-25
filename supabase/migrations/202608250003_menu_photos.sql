-- Foto dei piatti.
--
-- Un menu si legge con gli occhi: senza fotografia ogni pizza si somiglia. La
-- foto e' pero' un dato a se', diverso da prezzo e ingredienti: quelli devono
-- cambiare tutti insieme o niente, una foto no. Per questo non entra nel
-- payload chiuso di upsert_menu_product ma passa da una funzione propria, e
-- puo' essere aggiunta o tolta senza toccare il resto del prodotto.
--
-- L'indirizzo deve essere https: il sito e' servito in https e un'immagine in
-- http verrebbe bloccata dal browser senza spiegazioni.

alter table public.products add column if not exists image_url text;

alter table public.products drop constraint if exists products_image_url_check;
alter table public.products add constraint products_image_url_check
  check (image_url is null or image_url ~ '^https://[^\s]+$');

create or replace function public.set_product_photo(p_product_id uuid, p_image_url text)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_url text;
begin
  if not public.is_creator() then
    raise exception 'creator role required' using errcode = '42501';
  end if;

  v_url := nullif(btrim(coalesce(p_image_url, '')), '');
  if v_url is not null and v_url !~ '^https://[^\s]+$' then
    raise exception 'the photo address must start with https://' using errcode = '22023';
  end if;

  update public.products set image_url = v_url where id = p_product_id;
  if not found then
    raise exception 'product not found' using errcode = '22023';
  end if;

  insert into public.events (actor_id, actor_kind, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'creator',
    case when v_url is null then 'menu.photo-removed' else 'menu.photo-set' end,
    'product', p_product_id, jsonb_build_object('image_url', v_url)
  );

  return v_url;
end;
$$;

revoke all on function public.set_product_photo(uuid, text) from public;
grant execute on function public.set_product_photo(uuid, text) to authenticated;

-- Archivio delle foto. Il bucket e' pubblico in lettura (le immagini stanno in
-- un menu pubblico) ma solo il Creator puo' caricarle o sostituirle.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-photos', 'menu-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "menu_photos_public_read" on storage.objects;
create policy "menu_photos_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu-photos');

drop policy if exists "menu_photos_creator_write" on storage.objects;
create policy "menu_photos_creator_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'menu-photos' and public.is_creator())
  with check (bucket_id = 'menu-photos' and public.is_creator());
