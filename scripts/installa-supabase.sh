#!/bin/bash
# Installa lo schema di Hot Meeting su un progetto Supabase VUOTO.
#
#   DB_URL="postgresql://postgres.xxxx:PASSWORD@aws-1-...:5432/postgres" \
#   bash scripts/installa-supabase.sh
#
# Mette in piedi tabelle, funzioni, regole di sicurezza e i 14 allergeni UE.
# NON carica pizze ne' ordini: il locale e' vuoto e pronto per il menu vero.
# Si puo' rilanciare senza danni: ogni pezzo e' idempotente.
set -euo pipefail

if [ -z "${DB_URL:-}" ]; then
  echo "Manca DB_URL. Prendila da Supabase: Project Settings > Database > Connection string (URI, pooler)."
  echo "Esempio: DB_URL=\"postgresql://postgres.abcd:LA_PASSWORD@aws-1-eu-west-1.pooler.supabase.com:5432/postgres\" bash scripts/installa-supabase.sh"
  exit 1
fi

RADICE="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(docker run -i --rm -v "$RADICE/supabase:/sb:ro" postgres:17-alpine psql "$DB_URL" -v ON_ERROR_STOP=1)

echo "1/2  Schema, funzioni e sicurezza (le migrazioni, in ordine)"
for file in "$RADICE"/supabase/migrations/*.sql; do
  echo "     $(basename "$file")"
  "${PSQL[@]}" -q -f "/sb/migrations/$(basename "$file")"
done

echo "2/2  I 14 allergeni dell'elenco UE"
"${PSQL[@]}" -q -f /sb/reference-allergens.sql

echo
echo "Fatto. Il database e' installato e vuoto."
echo "Restano due passi manuali, spiegati in docs/installazione.md:"
echo "  - creare l'utente Creator e dargli il ruolo"
echo "  - scrivere URL e chiave publishable in js/config.js"
