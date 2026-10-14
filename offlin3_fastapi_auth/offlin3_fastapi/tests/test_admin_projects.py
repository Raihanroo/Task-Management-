"""Admin dashboard contract, per-user quotas, project PUT/DELETE and my-access."""
import os, sys
os.environ.setdefault("SECRET_KEY", "test-secret")
for k, v in dict(DB_NAME="x", DB_USER="x", DB_PASSWORD="x", DB_HOST="localhost", DB_PORT="5432").items():
    os.environ.setdefault(k, v)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from db import get_db
from db_base import Base
from main import app
import models


def test_admin_and_projects():
    async def run():
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
            assert r.json()["is_deleted"] is False
            uid = r.json()["id"]
            r = await c.post("/auth/login", json={"username": name, "password": "password123"})
            return uid, {"Authorization": f"Bearer {r.json()['access_token']}"}

        def ok(resp, code):
            assert resp.status_code == code, (resp.status_code, resp.text)
            return resp

        admin, Ha = await reg("admin1")
        async with Session() as s:
            (await s.get(models.User, admin)).role = "admin"
            await s.commit()
        raihan, Hr = await reg("raihan")
        sifat, Hs = await reg("sifat")
        viewer, Hv = await reg("viewer")
        outsider, Ho = await reg("outsider")

        # ---------------- project: PUT / my-access / DELETE ----------------
        pid = ok(await c.post("/projects", json={"title": "P", "description": "d"}, headers=Hr), 201).json()["id"]
        ok(await c.put(f"/projects/{pid}", json={"title": "P2"}, headers=Hr), 200)
        ok(await c.put(f"/projects/{pid}", json={"title": "hack"}, headers=Hs), 403)
        ok(await c.post(f"/projects/{pid}/members", json={"username": "sifat", "can_edit": True}, headers=Hr), 201)
        ok(await c.post(f"/projects/{pid}/members", json={"username": "viewer"}, headers=Hr), 201)

        a = ok(await c.get(f"/projects/{pid}/my-access", headers=Hr), 200).json()
        assert a == {"role": "owner", "is_owner": True, "can_edit": True, "can_manage_members": True}
        a = ok(await c.get(f"/projects/{pid}/my-access", headers=Hs), 200).json()
        assert a["role"] == "editor" and a["can_edit"] is True and a["can_manage_members"] is False
        a = ok(await c.get(f"/projects/{pid}/my-access", headers=Hv), 200).json()
        assert a["role"] == "viewer" and a["can_edit"] is False
        assert ok(await c.get(f"/projects/{pid}/my-access", headers=Ha), 200).json()["role"] == "admin"
        ok(await c.get(f"/projects/{pid}/my-access", headers=Ho), 403)

        tid = ok(await c.post(f"/projects/{pid}/tasks", json={"title": "T", "assigned_to_username": "sifat"}, headers=Hr), 201).json()["id"]
        ok(await c.delete(f"/projects/{pid}", headers=Hs), 403)
        ok(await c.delete(f"/projects/{pid}", headers=Hr), 204)
        ok(await c.get(f"/projects/{pid}", headers=Hr), 404)
        ok(await c.get(f"/tasks/{tid}", headers=Hr), 404)               # tasks removed with project
        ok(await c.get(f"/projects/{pid}/members", headers=Hr), 404)

        # ---------------- admin: users list / detail ----------------
        ok(await c.get("/admin/users", headers=Hr), 403)
        r = ok(await c.get("/admin/users?page=1&limit=2", headers=Ha), 200).json()
        assert r["total_users"] == 5 and r["total_pages"] == 3 and len(r["users"]) == 2 and r["page"] == 1
        assert r["users"][0]["is_deleted"] is False
        r = ok(await c.get("/admin/users?page=3&limit=2", headers=Ha), 200).json()
        assert len(r["users"]) == 1 and r["page"] == 3
        r = ok(await c.get("/admin/users?search=sif", headers=Ha), 200).json()
        assert [u["username"] for u in r["users"]] == ["sifat"]

        d = ok(await c.get(f"/admin/users/{raihan}", headers=Ha), 200).json()
        assert d["user"]["username"] == "raihan" and d["projects_count"] == 0
        assert (d["effective_max_projects"], d["effective_max_tasks"], d["effective_max_tasks_per_project"]) == (5, 20, 50)
        ok(await c.get("/admin/users/9999", headers=Ha), 404)

        # ---------------- admin: ban / unban ----------------
        u = ok(await c.patch(f"/admin/users/{outsider}/status", json={"is_active": False}, headers=Ha), 200).json()
        assert u["is_active"] is False
        ok(await c.get("/auth/me", headers=Ho), 403)                       # banned message path
        ok(await c.patch(f"/admin/users/{outsider}/status", json={"is_active": True}, headers=Ha), 200)
        ok(await c.get("/auth/me", headers=Ho), 200)
        ok(await c.patch(f"/admin/users/{admin}/status", json={"is_active": False}, headers=Ha), 400)   # self / last admin

        # ---------------- admin: settings + per-user quota ----------------
        s = ok(await c.get("/admin/settings", headers=Ha), 200).json()
        assert s["default_max_projects_per_user"] == 5
        s = ok(await c.put("/admin/settings", json={"default_max_projects_per_user": 2}, headers=Ha), 200).json()
        assert s["default_max_projects_per_user"] == 2 and s["default_max_tasks_per_user"] == 20
        ok(await c.put("/admin/settings", json={"default_max_projects_per_user": 0}, headers=Ha), 422)

        ok(await c.post("/projects", json={"title": "a"}, headers=Hs), 201)
        ok(await c.post("/projects", json={"title": "b"}, headers=Hs), 201)
        ok(await c.post("/projects", json={"title": "c"}, headers=Hs), 400)          # global default = 2

        l = ok(await c.put(f"/admin/users/{sifat}/limits", json={"max_projects": 3}, headers=Ha), 200).json()
        assert l["max_projects"] == 3 and l["max_tasks"] is None
        assert ok(await c.get(f"/admin/users/{sifat}", headers=Ha), 200).json()["effective_max_projects"] == 3
        ok(await c.post("/projects", json={"title": "c"}, headers=Hs), 201)          # override allows a 3rd
        ok(await c.post("/projects", json={"title": "d"}, headers=Hs), 400)
        ok(await c.delete(f"/admin/users/{sifat}/limits", headers=Ha), 200)
        assert ok(await c.get(f"/admin/users/{sifat}", headers=Ha), 200).json()["effective_max_projects"] == 2
        ok(await c.put("/admin/users/9999/limits", json={"max_projects": 3}, headers=Ha), 404)

        # ---------------- admin: soft delete ----------------
        ok(await c.delete(f"/admin/users/{viewer}", headers=Ha), 204)
        r = ok(await c.get("/admin/users", headers=Ha), 200).json()
        assert r["total_users"] == 4
        r = ok(await c.get("/admin/users?include_deleted=true", headers=Ha), 200).json()
        assert r["total_users"] == 5 and any(u["is_deleted"] for u in r["users"])
        ok(await c.delete(f"/admin/users/{admin}", headers=Ha), 400)
        await engine.dispose()

    asyncio.run(run())
