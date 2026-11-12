# Plain PostgreSQL schema migrations

These versioned migrations define a fresh, standalone PostgreSQL schema. They are derived from the
reconstructed schema and current application queries; they are not a dump of the unavailable live
database. Review the schema against a production export before planning a production data cutover.

Apply with `npm run db:migrate` after configuring `DATABASE_URL`. The runner takes a PostgreSQL
advisory lock, applies each file inside a transaction, records its SHA-256 checksum, and refuses to
silently replay a migration whose contents changed. Add a new numbered SQL migration for later
schema changes; do not edit an already-applied migration.

The initial schema includes app-managed accounts, sessions, reset state, application tables,
constraints, indexes, and transactional functions. It contains no Supabase Auth roles, policies,
functions, or `auth.users` foreign keys. The API has not yet been switched from its existing
Supabase query code to this database; the schema runner is the first database cutover layer.

This baseline intentionally fails on an existing schema with conflicting tables. For a live
database, first take and verify a backup, compare its schema and data with this baseline, then write
an explicit import/upgrade path. Do not point this fresh-install baseline at production data.
