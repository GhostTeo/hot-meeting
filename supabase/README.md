# Supabase deployment safeguards

`create_public_order` validates a closed JSON shape, enforces small payload and
array limits, recalculates every price, requires an idempotency token, and
applies a modest database guard of five new web orders per normalized phone
number in ten minutes. An exact retry with the same token is returned before
that guard and does not consume another daily sequence.

The phone guard is defense in depth, not the deployment perimeter: PostgreSQL
does not receive a trustworthy client IP through this RPC. Production must also
rate-limit `create_public_order` at the API gateway or Edge Function by IP and
device/session signal, with stricter burst limits and monitoring. Keep CAPTCHA
or another challenge available for abusive traffic, and configure platform
request-body limits no higher than the function's 32 KiB limit.

Clients must generate one UUID `request_token` per checkout attempt, persist it
until a definitive response, and reuse it only for retries of the identical
request. A token reused with different normalized input is rejected.

## Behavioral verification

The regular test suite includes structural checks and explicitly skips the
database behavior harness unless requested. With Docker running and the local
`postgres:17-alpine` image present, run:

```sh
npm run test:db
```

The harness creates and removes an isolated PostgreSQL container, installs the
Supabase role/JWT shim, applies the migration and seed, and exercises RLS,
validation, idempotency, sequencing, immutable history, snapshots, foreign keys,
and close/order serialization.
