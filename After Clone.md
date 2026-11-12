# After Clone: Restore the Demo Data

These steps restore the database snapshot and uploaded topic images included in this repository. Run the commands in PowerShell from the repository root.

The snapshot files are:

- `lessonswebsite-clean-db-backup.sql` — database schema and records.
- `lessonswebsite-clean-topic-uploads-backup.tar.gz` — uploaded topic images.

## 1. Start Docker and configure the project

Install and start Docker Desktop. Create a local environment file:

```powershell
Copy-Item .env.example .env
```

You can change `MYSQL_ROOT_PASSWORD` in `.env` to a private password for this local Docker database. Do not commit `.env`.

Start MySQL and the backend:

```powershell
docker compose up -d --build
docker compose ps
```

Before continuing, confirm the `db` service is healthy.

## 2. Restore the database

Stop the backend while restoring, copy the dump into the MySQL container, import it, then restart the backend:

```powershell
docker compose stop backend
docker compose cp .\lessonswebsite-clean-db-backup.sql db:/tmp/lessonswebsite-clean-db-backup.sql
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < /tmp/lessonswebsite-clean-db-backup.sql'
docker compose start backend
```

The dump replaces the tables and records in the `lessonswebsite_clean` database. Only run this on a fresh clone or when you are okay replacing that database's contents.

## 3. Restore uploaded images

Extract the image archive into the Docker volume used by the app:

```powershell
docker run --rm -v lessonswebsite-clean-topic-uploads:/data -v "${PWD.Path}:/backup" alpine tar -xzf /backup/lessonswebsite-clean-topic-uploads-backup.tar.gz -C /data
```

## 4. Verify the restore

Check that the API returns topics:

```powershell
curl.exe http://localhost:5001/api/topics
```

You can then start the frontend as described in [DOCKER.md](./DOCKER.md).

## Important notes

- The database and image archive are repository snapshots, not automatic live synchronization. New changes made after the snapshot was created will not appear unless you create and share an updated snapshot.
- Restoring the database overwrites the clone's initial database contents.
- The database and image archives are public because they are committed to this repository. Never add real or sensitive data to public snapshots.
- Do not run `docker compose down -v` unless you intend to delete this Compose project's database and uploaded-image volumes.
