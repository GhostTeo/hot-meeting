// La porta blindata davanti agli ordini.
//
// Il sito, quando in config.js c'e' `orderEndpoint`, manda gli ordini qui
// invece che direttamente al database. Prima di inoltrarli si fanno due
// controlli che dal database non si possono fare, perche' li' non arriva
// l'indirizzo di chi chiama:
//   1. quanti ordini arrivano dallo stesso indirizzo IP (contatori in
//      rate_buckets, via rate_limit_hit): dieci al minuto e centoventi al
//      giorno. Larghi apposta: sulle reti mobili molti clienti diversi escono
//      con lo stesso indirizzo, e nessun cliente vero deve restare fuori. Il
//      tetto stretto per numero di telefono lo mette gia' il database;
//   2. il captcha di Cloudflare Turnstile, se c'e' il segreto TURNSTILE_SECRET.
// Poi si chiama create_public_order come farebbe il sito, e si rimanda
// indietro la risposta (o l'errore, con le stesse parole del database, cosi'
// l'app li traduce come sempre). Vedi docs/sicurezza.md per accenderla.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const env = Deno.env.toObject();

const cors = {
  'Access-Control-Allow-Origin': env.SITE_ORIGIN ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function risposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function indirizzo(req: Request) {
  const grezzo = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '';
  return grezzo.split(',')[0].trim() || 'sconosciuto';
}

async function captchaSuperato(token: string | null, ip: string) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const verifica = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip })
    });
    const esito = await verifica.json();
    return esito?.success === true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return risposta({ error: 'method not allowed' }, 405);

  const testo = await req.text();
  if (testo.length > 32768) return risposta({ error: 'payload exceeds 32768 bytes' }, 413);
  let corpo: { payload?: unknown; turnstile_token?: string | null };
  try {
    corpo = JSON.parse(testo);
  } catch {
    return risposta({ error: 'payload must be a JSON object' }, 400);
  }
  if (!corpo || typeof corpo.payload !== 'object' || corpo.payload === null) {
    return risposta({ error: 'payload must be a JSON object' }, 400);
  }

  const ip = indirizzo(req);
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const alMinuto = await admin.rpc('rate_limit_hit', { p_bucket: `ip:${ip}:minuto`, p_limit: 10, p_window: '1 minute' });
  const alGiorno = await admin.rpc('rate_limit_hit', { p_bucket: `ip:${ip}:giorno`, p_limit: 120, p_window: '1 day' });
  if (alMinuto.error || alGiorno.error) return risposta({ error: 'servizio momentaneamente non disponibile' }, 503);
  if (alMinuto.data === false || alGiorno.data === false) return risposta({ error: 'too many orders right now' }, 429);

  if (!(await captchaSuperato(corpo.turnstile_token ?? null, ip))) {
    return risposta({ error: 'captcha non superato' }, 403);
  }

  const { data, error } = await admin.rpc('create_public_order', { payload: corpo.payload });
  if (error) return risposta({ error: error.message }, 400);
  return risposta(data);
});
