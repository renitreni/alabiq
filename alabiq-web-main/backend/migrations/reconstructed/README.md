# Reconstructed Alabiq migrations

These files create the database expected by the supplied application code in a **new Supabase
project running PostgreSQL 15 or newer**. They are a new baseline inferred from code, not copies
of the developer's private migrations.

## Apply in this order

1. `0001_schema.sql` — 43 application tables, relationships, defaults, settings, RLS enabled,
   and service-role access. Includes the latest fetched remote's `stcpay_enabled` setting.
2. `0002_security_and_indexes.sql` — scoped client reads, safe profile edits, confidentiality,
   foreign-key lookup indexes, uniqueness rules, and the privilege-check function.
3. `0003_functions.sql` — atomic shop checkout, stock release, saved-card defaults, account
   scrubbing, and retention functions.
4. `0004_integrity.sql` — state/value checks, catalogue/cart relationship validation, and
   rejection of non-finite numeric values.

Open each file in Supabase SQL Editor and run it as the database administrator in this order.
Each file is transactional. Stop if a file fails; its transaction rolls back. Resolve that failure
before running the remaining files. Keep a record of which files succeeded.

Alternatively, with a PostgreSQL client configured through your normal connection settings:

```sh
psql -X -v ON_ERROR_STOP=1 -f 0001_schema.sql
psql -X -v ON_ERROR_STOP=1 -f 0002_security_and_indexes.sql
psql -X -v ON_ERROR_STOP=1 -f 0003_functions.sql
psql -X -v ON_ERROR_STOP=1 -f 0004_integrity.sql
```

Run from this directory. These commands use your configured PostgreSQL connection; confirm it is
the intended new project. No connection information or credentials are stored here.

**Do not run this baseline on the inaccessible existing production database.** Table creation
deliberately fails if the application tables already exist. Silently skipping existing tables
would hide incompatible structures. These files are also not intended to be replayed after success.
The reconstructed `0004_integrity.sql` is unrelated to the private developer's pilot-only
`0004_auto_approve_drivers.PILOT.sql`; this baseline never auto-approves drivers.

Supabase must already provide `auth.users`, `auth.uid()`, and the `anon`, `authenticated`, and
`service_role` roles. Do not execute `tests/bootstrap.sql` in Supabase; it only supplies test stubs.

## Finish application setup

From `backend/`, configure the project's environment values, then:

```sh
npm run setup:buckets
npm run check:migrations
npm run check:shop
```

The existing bucket setup script creates/configures private `payment-proofs` and `driver-docs`,
and public `merchant-images` and `avatars`, using the application's configured limits and names.
Uploads and private downloads use backend-issued signed URLs. No public Storage write policy is
added by these migrations.

The check scripts require the appropriate Supabase keys. `check:shop` includes checks for named
sample stores that are not seeded here; those checks will skip until the stores are provisioned.
The existing checks include RPC calls, retention cleanup, and zero-UUID privilege probes; run them
against this new test project first.

Provision administrator accounts using the existing backend setup flow. The schema does not seed
passwords, payment secrets, real people, or merchants. Auth profiles are created by the existing
backend sync/provisioning code; no trigger trusts user-controlled Auth metadata for privileged roles.

## Edge cases handled

- Each migration is transactional and takes an advisory lock.
- Account deletion keeps order/payment history; identifying foreign keys use `ON DELETE SET NULL`.
- Catalogue deletion cannot silently remove reserved inventory references.
- Foreign-key names support the explicit PostgREST customer joins used by the app.
- An absent variant or size has a stable cart-line identity, preventing duplicate null-valued lines.
- Shop checkout requires a nonempty matching cart, locks it, rejects duplicate/stale lines,
  cross-store products, mismatched variants, changed prices, invalid quantities, and inconsistent totals.
- Checkout locks products and variants in a consistent order. Insufficient stock raises `SM001`
  with the JSON detail expected by the backend. A failure rolls back stock, orders, and cart changes.
- Checkout supports nullable/empty-string optional values sent by the current application.
- Only tracked stock is reserved. The reserved quantity is saved per line; changing `track_stock`
  later does not change what a cancellation restores.
- Stock release locks the order and is idempotent. Missing orders return the expected no-op object.
  Active orders cannot release inventory.
- Gateway transaction uniqueness and partial cash-payment indexes prevent duplicate payment rows.
- A dispatch offer must target exactly one job, with at most one pending offer per job.
- Driver ratings accept 1–5 stars and only one rating per job.
- Switching default cards is scoped to the user and serialized, so concurrent switches leave one default.
- Hours support multiple intervals per day and overnight intervals, while rejecting duplicate starts.
- Negative inventory, invalid coordinates, invalid money totals, NaN, and infinities are rejected.
- Public roles cannot call administrative RPCs, write privileged profile fields, or read confidential
  financial, stock, saved-card, login-event, and error-log fields.

## Deliberate reconstruction decisions and limits

- Types, precision, defaults, and deletion rules were reconstructed. They are not verified against
  the private database. Identifiers use UUIDs, money uses `numeric(14,2)`, rates use `numeric(8,6)`,
  and timestamps use `timestamptz`.
- Application statuses use text with CHECK constraints where the vocabulary was recovered. This
  avoids depending on unknown original enum type names.
- Business codes retain the `SM-`, `FD-`, and `SH-` prefixes but use a full random UUID suffix.
  They may be longer than historical codes.
- Merchant credit defaults, rating fields not written by the code, and some timestamps are inferred.
  Review business defaults before launch. They are easy to change explicitly in a follow-up migration.
- Clients can read their own profile/orders/carts and the listed catalogue. Most writes and all
  operational data go through the backend. There are no direct client merchant/admin write policies.
- RPC checkout trusts money computed by the backend, while checking internal arithmetic and current
  list prices. Repricing rules still live in the application's money modules.
- `delete_account_pii` guards active work and scrubs structured contact/address snapshots. It does
  not promise complete removal of personal data embedded in free text, arbitrary JSON, Storage
  objects, backups, or external payment-provider records. The application deletes Auth separately,
  so those two operations are not one transaction.
- Financial deletion rules are intentionally restrictive. Historical reset/demo cleanup scripts
  that expect cascading deletion of paid orders may fail; review their scope before using them.
- No cron retention schedules or Supabase Realtime publication changes are installed. The application
  uses backend Realtime broadcasts. Storage and Auth services remain Supabase-managed.
- This cannot recover data from the existing inaccessible database or prove its deployed structure.
- The prior `DATABASE_MAP.md` was a logical survey. Direct application reads/writes and the schema
  in these files take precedence where that survey omitted fields (for example `profiles.gender`
  and `webhook_events.booking_id`) or guessed an RPC argument.

## Local verification

Requires Node.js and Docker:

```sh
node tests/verify.cjs
PG_TEST_IMAGE=postgres:15-alpine node tests/verify.cjs
```

The runner creates a uniquely named, temporary PostgreSQL container with no published ports and no
persistent data mounts, then removes it in a `finally` block. It uses synthetic identities only.
The minimal Auth stubs test database logic, not Supabase Auth behavior.

Tests exercise fresh installation, replay rejection, RLS, grants, owner isolation, stock rollback,
plain/variant stock, repeated release, stale carts, duplicate payments, dispatch uniqueness,
competing checkouts, concurrent card defaults, account deletion, and retention validation.
A SQL adapter also runs the repository's existing migration checker against the temporary database.
That adapter verifies its SQL expectations; it does not test the PostgREST HTTP layer.

## Private files and backups

The existing `backend/migrations/` ignore rule covers this entire folder, including tests and this
README. Keep a separate private backup; Git commits and fresh clones will not contain these files.

