"""Member management flow (username add / permission / remove / assign). Run: pytest -q"""
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
import models  # noqa: F401


def test_member_flow():
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
            uid = r.json()["id"]
            r = await c.post("/auth/login", json={"username": name, "password": "password123"})
            return uid, {"Authorization": f"Bearer {r.json()['access_token']}"}

        def ok(resp, code):
            assert resp.status_code == code, (resp.status_code, resp.text)
            return resp

        owner, Ho = await reg("raihan")
        sifat, Hs = await reg("sifat")
        other, Hx = await reg("other")

        pid = ok(await c.post("/projects", json={"title": "P", "description": ""}, headers=Ho), 201).json()["id"]
        tid = ok(await c.post(f"/projects/{pid}/tasks", json={"title": "T"}, headers=Ho), 201).json()["id"]

        # the exact bug: assigning a non-member is rejected
        r = ok(await c.put(f"/tasks/{tid}", json={"assigned_to_username": "sifat"}, headers=Ho), 400)
        assert r.json()["detail"] == "Assignee must be a project member"

        # add by username
        m = ok(await c.post(f"/projects/{pid}/members", json={"username": "sifat", "can_edit": False}, headers=Ho), 201).json()
        assert m["username"] == "sifat" and m["user_id"] == sifat and m["can_edit"] is False
        # add by user_id still works
        ok(await c.post(f"/projects/{pid}/members", json={"user_id": other}, headers=Ho), 201)
        # validations
        ok(await c.post(f"/projects/{pid}/members", json={"username": "sifat"}, headers=Ho), 400)      # duplicate
        ok(await c.post(f"/projects/{pid}/members", json={"username": "ghost"}, headers=Ho), 404)      # unknown
        ok(await c.post(f"/projects/{pid}/members", json={"username": "raihan"}, headers=Ho), 400)     # owner
        ok(await c.post(f"/projects/{pid}/members", json={}, headers=Ho), 422)                          # nothing given
        ok(await c.post(f"/projects/{pid}/members", json={"username": "x"}, headers=Hs), 403)          # non-owner

        # list shows usernames
        lst = ok(await c.get(f"/projects/{pid}/members", headers=Ho), 200).json()
        assert {x["username"] for x in lst} == {"sifat", "other"}
        ok(await c.get(f"/projects/{pid}/members", headers=Hs), 403)

        # the originally failing request now works
        r = ok(await c.put(f"/tasks/{tid}", json={"title": "T", "assigned_to_username": "sifat"}, headers=Ho), 200)
        assert r.json()["assigned_to_id"] == sifat

        # viewer cannot edit, editor can
        ok(await c.put(f"/tasks/{tid}", json={"title": "hack"}, headers=Hs), 403)
        ok(await c.patch(f"/projects/{pid}/members/{sifat}", json={"can_edit": True}, headers=Ho), 200)
        ok(await c.put(f"/tasks/{tid}", json={"title": "edited"}, headers=Hs), 200)
        # but editor still cannot reassign
        ok(await c.put(f"/tasks/{tid}", json={"assigned_to_username": "other"}, headers=Hs), 403)

        # remove -> task unassigned, access gone
        ok(await c.delete(f"/projects/{pid}/members/{sifat}", headers=Ho), 204)
        t = ok(await c.get(f"/tasks/{tid}", headers=Ho), 200).json()
        assert t["assigned_to_id"] is None
        ok(await c.get(f"/projects/{pid}", headers=Hs), 403)
        ok(await c.delete(f"/projects/{pid}/members/{sifat}", headers=Ho), 404)
        await engine.dispose()

    asyncio.run(run())
