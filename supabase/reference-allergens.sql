-- I 14 allergeni dell'elenco UE (Reg. 1169/2011). Dato di riferimento, non
-- dimostrativo: uguale per ogni pizzeria, resta anche in un'installazione pulita.
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


