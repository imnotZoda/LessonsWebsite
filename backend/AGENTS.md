# Backend (Express API)

Express 5 + `mysql2/promise`, CommonJS, every route in `server.js`. `db.js` exports the pool, configured by `DB_*` env vars. Runs in Docker (host port `5001`) or standalone with `npm start` after `npm install`.

## Verify

- No tests exist (`npm test` is a stub). Hit endpoints with `curl.exe http://localhost:5001/api/...` and check `docker compose logs -f backend`.
- `node --check server.js` for a syntax check without booting.

## Conventions

- Route shape: validate first with early `return res.status(4xx).json({ error })`, do DB work in `try`, `catch` → `res.status(500).json({ error: err.message })`. Match it.
- Coerce ids/params with `Number(...)`, then validate `Number.isInteger(...) && > 0` — copy the existing handlers' style.
- camelCase request/response JSON ↔ snake_case columns (`parentTopicId` → `parent_topic_id`). Convert at the boundary; SQL stays snake_case.
- Multi-statement writes go through `db.getConnection()` + `beginTransaction`/`commit`/`rollback` with `connection.release()` in `finally` — see `POST /api/quizzes`. Single queries use the pool directly.
- Uploads: multer disk storage into `uploads/` (a Docker volume on the clean stack), `crypto.randomUUID()` filenames, 5 MB cap, `image/*` filter, served at `/uploads/`. Call `removeUploadedImage` whenever an `image_url` row is deleted or replaced.
- `imagePositions`/`imageUpdates`/`removeImageIds` arrive as JSON strings inside multipart bodies — parse via `parsePositionList`/`JSON.parse` and reject malformed input with a 400.
- One quiz per topic (`quizzes.topic_id` UNIQUE); `POST /api/quizzes` deletes any existing quiz first. Questions need ≥2 options and exactly one `isCorrect`.
- Topics are a two-level tree: `parent_topic_id NULL` = top-level, and only top-level topics may be parents (enforced in POST/PUT).
- `app.listen` sits mid-file before the quiz routes — Express still registers them in time; cosmetic only. Keep new routes grouped with their domain.
- Config is env-only (`DB_*`, `PORT`); defaults point at the Docker DB. No auth middleware exists — every endpoint is unauthenticated, clients pass `authorId`/`userId`.

## Database

- `mysql-clean-init/*.sql` is the schema source of truth — Docker init runs it once, on a fresh volume only. Schema change = edit it, then `docker compose down -v` + `docker compose up --build -d` (wipes local data and uploads).
- `mysql-init/` is dead history; the clean stack never runs it.
- Existing API seeders in `seeds/` POST to the live API and refuse to overwrite an existing quiz. The Lesson 16 seeder writes directly to MySQL with `node seeds/seed-lesson16-quizzes.js`; when running it from the host, set `DB_PORT=3308` for the Compose port mapping. It refuses to replace existing quizzes and inserts the full set in one transaction.
