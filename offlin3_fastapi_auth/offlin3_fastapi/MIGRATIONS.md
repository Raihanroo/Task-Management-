# Database migrations

The application no longer creates or alters tables during startup. Alembic is
the source of truth for the database schema.

## New database

Run this from the project directory after setting `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `DB_HOST`, and `DB_PORT` in `.env`:

```powershell
py -m pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload
```

## Existing database created by the old startup code

The first revision describes the current RBAC schema. Verify the existing
database has the tables and columns represented by
`alembic/versions/0001_initial_schema.py`, take a backup, and then mark it as
already applied without recreating tables:

```powershell
pg_dump -Fc $env:DB_NAME > before-alembic.dump
alembic stamp 0001_initial_schema
```

Do not run `alembic upgrade head` on that database before stamping it; Alembic
will otherwise try to create tables that already exist.

## Recovering from an incorrect migration

Inspect the applied revision, then downgrade to the last known-good revision:

```powershell
alembic current
alembic history
alembic downgrade <last-good-revision>
```

After correcting the migration, create a new revision and apply it:

```powershell
alembic revision --autogenerate -m "describe the correction"
alembic upgrade head
```

The initial revision's downgrade removes the complete schema, so it should
only be used for disposable databases. For shared or production databases,
restore the backup or add a forward corrective migration instead.