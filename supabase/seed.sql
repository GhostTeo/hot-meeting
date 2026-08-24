-- Stable demonstration identifiers keep seed relationships reproducible.
insert into public.allergens (id, slug, label_it, label_en, eu_order) values
  ('10000000-0000-4000-8000-000000000001', 'glutine', 'Cereali contenenti glutine', 'Cereals containing gluten', 1),
  ('10000000-0000-4000-8000-000000000002', 'crostacei', 'Crostacei', 'Crustaceans', 2),
  ('10000000-0000-4000-8000-000000000003', 'uova', 'Uova', 'Eggs', 3),
  ('10000000-0000-4000-8000-000000000004', 'pesce', 'Pesce', 'Fish', 4),
  ('10000000-0000-4000-8000-000000000005', 'arachidi', 'Arachidi', 'Peanuts', 5),
  ('10000000-0000-4000-8000-000000000006', 'soia', 'Soia', 'Soybeans', 6),
  ('10000000-0000-4000-8000-000000000007', 'latte', 'Latte', 'Milk', 7),
  ('10000000-0000-4000-8000-000000000008', 'frutta-a-guscio', 'Frutta a guscio', 'Nuts', 8),
  ('10000000-0000-4000-8000-000000000009', 'sedano', 'Sedano', 'Celery', 9),
  ('10000000-0000-4000-8000-000000000010', 'senape', 'Senape', 'Mustard', 10),
  ('10000000-0000-4000-8000-000000000011', 'sesamo', 'Semi di sesamo', 'Sesame seeds', 11),
  ('10000000-0000-4000-8000-000000000012', 'solfiti', 'Anidride solforosa e solfiti', 'Sulphur dioxide and sulphites', 12),
  ('10000000-0000-4000-8000-000000000013', 'lupini', 'Lupini', 'Lupin', 13),
  ('10000000-0000-4000-8000-000000000014', 'molluschi', 'Molluschi', 'Molluscs', 14)
on conflict (slug) do update set
  label_it = excluded.label_it,
  label_en = excluded.label_en,
  eu_order = excluded.eu_order;

insert into public.products (id, slug, product_type, price_cents, available, sort_order) values
  ('20000000-0000-4000-8000-000000000001', 'margherita', 'pizza', 800, true, 10),
  ('20000000-0000-4000-8000-000000000002', 'diavola', 'pizza', 1000, true, 20),
  ('20000000-0000-4000-8000-000000000003', 'bufala', 'pizza', 1100, true, 30),
  ('20000000-0000-4000-8000-000000000004', 'cola', 'drink', 300, true, 40)
on conflict (slug) do update set
  product_type = excluded.product_type,
  price_cents = excluded.price_cents,
  available = excluded.available,
  sort_order = excluded.sort_order;

insert into public.product_translations (product_id, locale, name, description) values
  ('20000000-0000-4000-8000-000000000001', 'it', 'Margherita', 'Pomodoro, mozzarella e basilico'),
  ('20000000-0000-4000-8000-000000000001', 'en', 'Margherita', 'Tomato, mozzarella and basil'),
  ('20000000-0000-4000-8000-000000000002', 'it', 'Diavola', 'Pomodoro, mozzarella e salame piccante'),
  ('20000000-0000-4000-8000-000000000002', 'en', 'Diavola', 'Tomato, mozzarella and spicy salami'),
  ('20000000-0000-4000-8000-000000000003', 'it', 'Bufala', 'Pomodoro, mozzarella di bufala e basilico'),
  ('20000000-0000-4000-8000-000000000003', 'en', 'Buffalo mozzarella', 'Tomato, buffalo mozzarella and basil'),
  ('20000000-0000-4000-8000-000000000004', 'it', 'Cola', 'Bibita fresca'),
  ('20000000-0000-4000-8000-000000000004', 'en', 'Cola', 'Chilled soft drink')
on conflict (product_id, locale) do update set
  name = excluded.name,
  description = excluded.description;

insert into public.ingredients (id, slug, additional_price_cents, available, sort_order) values
  ('30000000-0000-4000-8000-000000000001', 'pomodoro', 0, true, 10),
  ('30000000-0000-4000-8000-000000000002', 'mozzarella', 150, true, 20),
  ('30000000-0000-4000-8000-000000000003', 'basilico', 0, true, 30),
  ('30000000-0000-4000-8000-000000000004', 'salame-piccante', 200, true, 40),
  ('30000000-0000-4000-8000-000000000005', 'mozzarella-di-bufala', 200, true, 50),
  ('30000000-0000-4000-8000-000000000006', 'prosciutto-cotto', 200, true, 60),
  ('30000000-0000-4000-8000-000000000007', 'olive', 100, true, 70),
  ('30000000-0000-4000-8000-000000000008', 'cipolla', 100, true, 80),
  ('30000000-0000-4000-8000-000000000009', 'prosciutto-crudo', 250, true, 90),
  ('30000000-0000-4000-8000-000000000010', 'acciughe', 200, true, 100)
on conflict (slug) do update set
  additional_price_cents = excluded.additional_price_cents,
  available = excluded.available,
  sort_order = excluded.sort_order;

insert into public.ingredient_translations (ingredient_id, locale, name) values
  ('30000000-0000-4000-8000-000000000001', 'it', 'Pomodoro'),
  ('30000000-0000-4000-8000-000000000001', 'en', 'Tomato'),
  ('30000000-0000-4000-8000-000000000002', 'it', 'Mozzarella'),
  ('30000000-0000-4000-8000-000000000002', 'en', 'Mozzarella'),
  ('30000000-0000-4000-8000-000000000003', 'it', 'Basilico'),
  ('30000000-0000-4000-8000-000000000003', 'en', 'Basil'),
  ('30000000-0000-4000-8000-000000000004', 'it', 'Salame piccante'),
  ('30000000-0000-4000-8000-000000000004', 'en', 'Spicy salami'),
  ('30000000-0000-4000-8000-000000000005', 'it', 'Mozzarella di bufala'),
  ('30000000-0000-4000-8000-000000000005', 'en', 'Buffalo mozzarella'),
  ('30000000-0000-4000-8000-000000000006', 'it', 'Prosciutto cotto'),
  ('30000000-0000-4000-8000-000000000006', 'en', 'Cooked ham'),
  ('30000000-0000-4000-8000-000000000007', 'it', 'Olive'),
  ('30000000-0000-4000-8000-000000000007', 'en', 'Olives'),
  ('30000000-0000-4000-8000-000000000008', 'it', 'Cipolla'),
  ('30000000-0000-4000-8000-000000000008', 'en', 'Onion'),
  ('30000000-0000-4000-8000-000000000009', 'it', 'Prosciutto crudo'),
  ('30000000-0000-4000-8000-000000000009', 'en', 'Cured ham'),
  ('30000000-0000-4000-8000-000000000010', 'it', 'Acciughe'),
  ('30000000-0000-4000-8000-000000000010', 'en', 'Anchovies')
on conflict (ingredient_id, locale) do update set name = excluded.name;

insert into public.product_ingredients
  (product_id, ingredient_id, is_included, removable, can_add, max_quantity, sort_order)
values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', true, true, false, 1, 10),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', true, true, false, 1, 20),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', true, true, false, 1, 30),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', false, false, true, 5, 40),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', false, false, true, 5, 50),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000007', false, false, true, 5, 60),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', true, true, false, 1, 10),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', true, true, false, 1, 20),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', true, true, false, 1, 30),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000008', false, false, true, 5, 40),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', false, false, true, 5, 50),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', false, false, true, 5, 60),
  ('20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', true, true, false, 1, 10),
  ('20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000005', true, true, false, 1, 20),
  ('20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', true, true, false, 1, 30),
  ('20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000009', false, false, true, 5, 40),
  ('20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000010', false, false, true, 5, 50)
on conflict (product_id, ingredient_id) do update set
  is_included = excluded.is_included,
  removable = excluded.removable,
  can_add = excluded.can_add,
  max_quantity = excluded.max_quantity,
  sort_order = excluded.sort_order;

insert into public.product_allergens (product_id, allergen_id) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000007'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007')
on conflict do nothing;

insert into public.closures (
  id, closure_type, weekday, public_message, enabled
) values (
  '40000000-0000-4000-8000-000000000001',
  'weekly',
  2,
  'Chiuso per riposo settimanale',
  true
)
on conflict (id) do update set
  weekday = excluded.weekday,
  public_message = excluded.public_message,
  enabled = excluded.enabled;
