# Project & Task RBAC API

FastAPI + async SQLAlchemy + PostgreSQL. This README covers the **RBAC / project-hierarchy task**: who can see, create, edit and delete projects and tasks, what happens when a user is deleted, and how admin limits work.

## What the task asked for, and where it lives

| # | Requirement | Endpoint | Allowed |
|---|---|---|---|
| 1 | Project owner sees all tasks in the project | `GET /projects/{id}/tasks` | Owner, admin: all tasks. Members: only tasks assigned to them. Others: 403 |
| 2 | Owner gives permission to edit tasks | `POST /projects/{id}/members`, `PATCH /projects/{id}/members/{user_id}` (`can_edit`) | Owner, admin |
| 3 | Collaborator can create tasks if edit permission is granted | `POST /projects/{id}/tasks` | Owner, admin, members with `can_edit=true` |
| 4 | Editor can modify task details | `PATCH /tasks/{id}` | Owner, admin, members with `can_edit=true` |
| 5 | Only the owner can modify project metadata | `PATCH /projects/{id}` (title, description) | Owner, admin. Editors get 403 |
| - | Owner assigns tasks to manager/editor | `assigned_to_id` on create; reassign via `PATCH /tasks/{id}` | Reassign: owner, admin only |
| - | Deleting a user keeps projects/tasks | `DELETE /users/me`, `DELETE /admin/users/{id}` | See "User deletion" |
| - | Admin has no limits, normal users do | `PUT /admin/limits` | Limits skipped for `role="admin"` |

Also added: `GET /projects/{id}/members` (owner/admin) so the owner can see who has edit permission.

## Permission matrix

| Action | Admin | Owner | Member with `can_edit` | Member without | Outsider |
|---|---|---|---|---|---|
| View project | yes | yes | yes | yes | no |
| List tasks | all | all | assigned only | assigned only | no |
| Create task | yes | yes | yes | no | no |
| Edit task details | yes | yes | yes | no | no |
| Reassign task | yes | yes | no | no | no |
| Delete task | yes | yes | no | no | no |
| Edit project title/description | yes | yes | no | no | no |
| Add member / change permission | yes | yes | no | no | no |

## User deletion

Deleting an account is a **soft delete**. The `users` row is kept, so `Project.owner_id`, `Task.assigned_to_id`, `Task.created_by_id` and project memberships still point at a valid user and nothing is orphaned or crashes on a foreign key.

- `users.deleted_at` is set and `is_active` becomes `false`.
- Username and email are replaced with `deleted_<id>_<random>` values, so the same email can register again.
- Old tokens stop working (401) and login is impossible.
- Admins cannot delete themselves through `/users/me`, which prevents locking the system out.
- A deleted account cannot be re-activated by an admin.

## Admin limits

`system_limits` holds `max_projects_per_user`, `max_tasks_per_user` and `max_tasks_per_project`. They are enforced for normal users only. Admins can create any number of projects and tasks.

## Setup (Windows, Git Bash)

```bash
python -m venv venv
source venv/Scripts/activate
python -m pip install -r requirements.txt -r requirements-dev.txt
```

Create `.env` in the project root (never commit it):

```env
DB_NAME=your_db
DB_USER=your_user
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
SECRET_KEY=a-long-random-string
```

Migrations (Alembic is the source of truth for the schema):

```bash
alembic current            # which revision is the DB on?
alembic upgrade head       # applies 0001 and 0002_user_soft_delete
```

If the database was created by the old startup code, run `alembic stamp 0001_initial_schema` first. See `MIGRATIONS.md`.

Run:

```bash
uvicorn main:app --reload  # http://127.0.0.1:8000/docs
```

## Tests

`pytest -q` runs an end-to-end check on in-memory SQLite, so Postgres is not needed. It covers every rule in the tables above: 403s for outsiders and non-editors, owner-only metadata edits, reassign/delete restrictions, soft delete keeping the project and tasks, and admin versus normal-user limits.

## Try it by hand in `/docs`

1. Register `owner`, `editor`, `viewer` with `POST /auth/register`.
2. Log in as owner, click **Authorize**, paste the token.
3. `POST /projects`, then `POST /projects/{id}/members` for the editor with `can_edit: false`.
4. As editor, `POST /projects/{id}/tasks` returns **403**.
5. As owner, `PATCH /projects/{id}/members/{editor_id}` with `can_edit: true`. The editor's create now returns **201**.
6. As editor, `PATCH /projects/{id}` returns **403**. As owner it returns **200**.
7. As owner, `DELETE /users/me`. The project and its tasks are still there (check as admin).

To make a user admin, set `role = 'admin'` on that row in the database.

## Design decisions to review

- **Roles are one flag.** "Manager" and "editor" are both `can_edit=true` on a project member. If the mentor wants separate roles, add a `role` column to `project_members`.
- **Reassigning and deleting tasks are owner-only.** The spec gives editors "modify task details", so these two were kept with the owner. Change `is_owner_or_admin` to `can_edit_project` in `routers/tasks.py` to allow editors.
- **Members only see tasks assigned to them.** Owner and admin see everything.
- **Members cannot look up other users.** Adding a member needs a user ID. A user search endpoint would help the frontend.

## Frontend

A React (Vite) client is in `frontend/`. It signs in, lists projects, shows tasks, and gives the owner the team and project-details controls.

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173, /api is proxied to FastAPI on port 8000
```

Keep `uvicorn` running in another terminal. For a deployed backend, set `VITE_API_URL` and enable CORS in FastAPI.

## Not done yet

- Filtering (planned for the next class)
- Next.js version of the frontend
