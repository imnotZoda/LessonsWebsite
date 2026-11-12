# Docker development

This project runs an isolated, clean MySQL database and Express API in Docker. The Compose project, containers, and volumes use the `lessonswebsite-clean` prefix, and the host ports are separate from the previous stack. The Expo frontend can stay on the host during development.

## First setup

To restore the committed database and uploaded-image snapshots after cloning, follow [After Clone](./After%20Clone.md).

1. Install and start Docker Desktop.
2. From the repository root, copy the example environment file and set a local MySQL root password:

```powershell
Copy-Item .env.example .env
```

The defaults use MySQL port `3308` and backend port `5001`. Override `MYSQL_HOST_PORT` or `BACKEND_HOST_PORT` in `.env` if those ports are occupied.

3. Start MySQL and the backend:

```powershell
docker compose up --build -d
```

4. Check the services:

```powershell
docker compose ps
curl.exe http://localhost:5001/api/topics
```

5. Start the frontend in another terminal:

```powershell
Set-Location frontend
npm install
$env:EXPO_PUBLIC_API_URL = "http://localhost:5001/api"
npm run web
```

Open `http://localhost:8081` in the browser.

## Useful commands

```powershell
# Follow backend logs
docker compose logs -f backend

# Stop containers but keep database data
docker compose down

# Stop this project and delete only its clean database and uploads
docker compose down -v

# Rebuild after backend or Dockerfile changes
docker compose up --build -d
```

The clean database is initialized with the complete current schema and two test accounts. The bootstrap runs only when this project's MySQL volume is first created. To recreate only this clean database from scratch, use `docker compose down -v` and then start the stack again. This removes the `lessonswebsite-clean` volumes only; it does not remove the previous project's database volume.

The Lesson 15 quiz data is stored in `backend/seeds/lesson15-robotic-manipulation-quizzes.json`. After the Lesson 15 topics and subtopics exist in the clean database, load the quizzes with:

```powershell
node backend\seeds\seed-lesson15-quizzes.js
```

The seeder targets `http://localhost:5001` by default, checks that each target is a Lesson 15 subtopic, and refuses to replace an existing quiz.

Test login accounts (password `123`):

| Role | Email | Username |
| --- | --- | --- |
| Admin | `admin@lessonswebsite.local` | `admin` |
| User | `user@lessonswebsite.local` | `user` |

These credentials are intentionally weak and are for local testing only; do not use them outside this isolated development environment.

Uploaded topic images are stored in this project's `lessonswebsite-clean-topic-uploads` Docker volume.

## Networking

The backend connects to MySQL with `DB_HOST=db` and internal port `3306`, because `db` is the Compose service name. Docker publishes MySQL on host port `3308` and the backend on `5001` to keep the clean stack isolated from existing project containers and common local services. The browser connects to the backend with `http://localhost:5001/api`.
