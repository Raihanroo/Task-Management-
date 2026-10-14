from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.admin import router as admin_router
from routers.auth import router as auth_router
from routers.projects import router as projects_router
from routers.tasks import router as tasks_router
from routers.users import router as users_router

app = FastAPI(title="Project Task RBAC API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(projects_router)
app.include_router(tasks_router)
app.include_router(users_router)


@app.get("/")
async def root():
    return {"message": "Project Task RBAC API is running"}