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

Creator clients use the normal authenticated user session and never a
`service_role` credential. `create_restaurant_order` validates and prices a
restaurant order atomically; direct inserts into `orders` are revoked.
`revise_order` appends a complete new item/totals revision. Historical rows are
not replaced: kitchen consumers read `current_order_items` and
`current_order_item_changes`, while reports read `current_order_totals`.

Payment differences begin through `record_payment_adjustment` in `pending`
state. `transition_payment_adjustment` appends the only permitted lifecycle
transition, from `pending` to either `recorded` or `cancelled`; terminal states
cannot move again. Reports must read `current_payment_adjustments` and include
only the statuses relevant to the report (normally `recorded`).

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
restaurant creation, current revision views, payment transitions, RLS, and
close/order serialization.
