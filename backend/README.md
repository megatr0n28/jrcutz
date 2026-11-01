# Backend architecture
```text
backend/
├── cmd/
│   └── api/
│       └── main.go
│
├── internal/
│   ├── handlers/
│   ├── middleware/
│   ├── models/
│   ├── repository/
│   ├── services/
│   └── database/
│
├── migrations/
│   ├── 001_init.up.sql
│   ├── 001_init.down.sql
│   ├── 002_barber_availability.up.sql
│   ├── 002_barber_availability.down.sql
│   └── 003_add_booking_indexes.up.sql
│
├── go.mod
├── go.sum
└── Dockerfile
```

## SQL migrations vs. GORM
|Feature| SQL migrations| GORM AutoMigrate|
|:-----:|:-------------:|:---------------:|
|PostgreSQL-specific features| Excellent| Limited|
|Complex constraints| Full control| Often requires raw SQL|
|Foreign keys| Explicit| Automatic conventions|
|Indexes| Full control| Supported|
|Schema versioning| Excellent with migration tool| Not its primary purpose|
|Rollbacks| Explicit migrations| Manual|
|Production deployment| Excellent| Requires additional care|
|Learning curve| SQL knowledge| Go ORM knowledge|

My recommendation:

Recommends SQL migrations + pgx
You already use pgxpool, so you don't need to introduce GORM just to manage database tables.

## SQL DB Migrations
Use a migration tool.  I recommend golang-migrate.
- Documentation: [golang-migrate GitHub](https://github.com/golang-migrate/migrate?utm_source=chatgpt.com).

#### How to install its CLI on your Mac:
```bash
brew install golang-migrate
```
## For existing DBs
#### Backup DB
```bash
docker compose --env-file dev.env exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > jrcutz-backup.sql
```
#### Use the migration tool's force command to establish the baseline:
This command marks the database as being at migration version 2. It does not execute either migration.
Important: This assumes your shell has DATABASE_URL exported. If it only exists in .env, load it into your shell first or supply the URL explicitly.
```bash
# Export environment variables from dev.env file directly into your terminal session
set -a && source dev.env && set +a

docker compose --env-file dev.env run --rm migrate \
  -path=/migrations \
  -database "$DATABASE_URL" \
  force 2
```
#### Verify migration results
```bash
docker compose --env-file dev.env run --rm migrate \
  -path=/migrations \
  -database "$DATABASE_URL" \
  version
```
##### You should see:
```text
2
```
#### Do this separately for each existing database whose schema is already at version 2. A genuinely fresh database should simply run up from version 0.

#### You can then run migrations with:
```bash
migrate \
  -path migrations \
  -database "postgres://barbershop:PASSWORD@localhost:5432/barbershop?sslmode=disable" \
  up

```
For production, use environment variables or a secret manager for credentials rather than putting passwords directly into commands or source files.