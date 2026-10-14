"""End-to-end RBAC check on in-memory SQLite (no Postgres needed).

Run from the project root:
    pip install -r requirements.txt -r requirements-dev.txt
    python tests/rbac_smoke_test.py
"""
import asyncio
import os
import sys

os.environ.setdefault("SECRET_KEY", "test-secret")
for k, v in dict(DB_NAME="x", DB_USER="x", DB_PASSWORD="x", DB_HOST="localhost", DB_PORT="5432").items():
    os.environ.setdefault(k, v)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from db import get_db
from db_base import Base
from main import app
import models


async def main() -> None:
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db():
        async with Session() as s:
            yield s

    app.dependency_overrides[get_db] = override_db
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")

    async def reg(name):
        r = await c.post("/auth/register", json={"username": name, "email": f"{name}@x.com", "password": "password123"})
        assert r.status_code == 201, r.text
        uid = r.json()["id"]
        r = await c.post("/auth/login", json={"username": name, "password": "password123"})
        return uid, {"Authorization": f"Bearer {r.json()['access_token']}"}

    def check(label, resp, code):
        ok = resp.status_code == code
        print(("PASS" if ok else "FAIL"), label, f"(got {resp.status_code}, want {code})")
        assert ok, resp.text

    owner, H_o = await reg("owner")
    editor, H_e = await reg("editor")
    viewer, H_v = await reg("viewer")
    outsider, H_x = await reg("outsider")
    admin, H_a = await reg("admin1")
    async with Session() as s:
        (await s.get(models.User, admin)).role = "admin"
        await s.commit()

    p = (await c.post("/projects", json={"title": "P", "description": "d"}, headers=H_o)).json()
    pid = p["id"]
    await c.post(f"/projects/{pid}/members", json={"user_id": editor, "can_edit": False}, headers=H_o)
    await c.post(f"/projects/{pid}/members", json={"user_id": viewer, "can_edit": False}, headers=H_o)

    # 3. collaborator without edit permission can't create; with permission can
    body = {"title": "t", "description": "", "assigned_to_id": editor}
    check("no-edit member cannot create task", await c.post(f"/projects/{pid}/tasks", json=body, headers=H_e), 403)
    check("owner grants edit", await c.patch(f"/projects/{pid}/members/{editor}", json={"can_edit": True}, headers=H_o), 200)
    r = await c.post(f"/projects/{pid}/tasks", json=body, headers=H_e)
    check("editor with permission creates task", r, 201)
    t1 = r.json()["id"]
    check("outsider cannot create task", await c.post(f"/projects/{pid}/tasks", json=body, headers=H_x), 403)

    # owner assigns a task to viewer
    r = await c.post(f"/projects/{pid}/tasks", json={"title": "for viewer", "assigned_to_id": viewer}, headers=H_o)
    check("owner creates+assigns task", r, 201)
    t2 = r.json()["id"]

    # 1. owner sees all; member sees only own; outsider blocked
    r = await c.get(f"/projects/{pid}/tasks", headers=H_o)
    assert len(r.json()) == 2; check("owner sees all tasks", r, 200)
    r = await c.get(f"/projects/{pid}/tasks", headers=H_v)
    assert [t["id"] for t in r.json()] == [t2]; check("member sees only assigned tasks", r, 200)
    check("outsider cannot list tasks", await c.get(f"/projects/{pid}/tasks", headers=H_x), 403)

    # 4. editor modifies details; but not reassign / delete
    check("editor edits task details", await c.patch(f"/tasks/{t1}", json={"title": "new", "completed": True}, headers=H_e), 200)
    check("editor cannot reassign", await c.patch(f"/tasks/{t1}", json={"assigned_to_id": viewer}, headers=H_e), 403)
    check("editor cannot delete task", await c.delete(f"/tasks/{t1}", headers=H_e), 403)
    check("viewer (no edit) cannot edit", await c.patch(f"/tasks/{t2}", json={"title": "x"}, headers=H_v), 403)
    check("owner reassigns", await c.patch(f"/tasks/{t1}", json={"assigned_to_id": viewer}, headers=H_o), 200)

    # 5. only owner edits project metadata
    check("editor cannot edit project metadata", await c.patch(f"/projects/{pid}", json={"title": "hack"}, headers=H_e), 403)
    r = await c.patch(f"/projects/{pid}", json={"title": "Renamed"}, headers=H_o)
    assert r.json()["title"] == "Renamed" and r.json()["owner_id"] == owner
    check("owner edits project metadata", r, 200)
    check("non-owner cannot list members", await c.get(f"/projects/{pid}/members", headers=H_e), 403)
    check("owner lists members", await c.get(f"/projects/{pid}/members", headers=H_o), 200)

    # 3. user deletes self -> project & tasks remain
    check("owner deletes own account", await c.delete("/users/me", headers=H_o), 204)
    check("deleted user's token rejected", await c.get("/projects", headers=H_o), 401)
    r = await c.post("/auth/login", json={"username": "owner", "password": "password123"})
    check("deleted user cannot log in", r, 401)
    async with Session() as s:
        proj = await s.get(models.Project, pid)
        assert proj is not None and proj.owner_id == owner
        assert (await s.execute(select(models.Task).where(models.Task.project_id == pid))).scalars().all()
    print("PASS project + tasks survive owner deletion")
    check("email reusable after delete", await c.post("/auth/register", json={"username": "owner", "email": "owner@x.com", "password": "password123"}), 201)
    check("admin still sees project", await c.get(f"/projects/{pid}", headers=H_a), 200)
    check("admin hard-delete path is soft too", await c.delete(f"/admin/users/{editor}", headers=H_a), 204)
    async with Session() as s:
        assert (await s.get(models.User, editor)) is not None
    print("PASS admin delete keeps row (no FK crash)")

    # Admin: no limits; normal user: limits
    await c.put("/admin/limits", json={"max_projects_per_user": 1, "max_tasks_per_user": 1, "max_tasks_per_project": 1}, headers=H_a)
    ap = (await c.post("/projects", json={"title": "A1"}, headers=H_a)).json()["id"]
    check("admin 2nd project (no limit)", await c.post("/projects", json={"title": "A2"}, headers=H_a), 201)
    for i in range(3):
        check(f"admin task #{i+1} (no limit)", await c.post(f"/projects/{ap}/tasks", json={"title": f"a{i}", "assigned_to_id": admin}, headers=H_a), 201)
    v_proj = (await c.post("/projects", json={"title": "V1"}, headers=H_v)).json()["id"]
    check("normal user 2nd project blocked", await c.post("/projects", json={"title": "V2"}, headers=H_v), 400)
    check("normal user task #1 ok", await c.post(f"/projects/{v_proj}/tasks", json={"title": "v", "assigned_to_id": viewer}, headers=H_v), 201)
    check("normal user task #2 blocked", await c.post(f"/projects/{v_proj}/tasks", json={"title": "v2", "assigned_to_id": viewer}, headers=H_v), 400)
    print("\nALL CHECKS PASSED")


asyncio.run(main())
