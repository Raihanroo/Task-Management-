from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from dotenv import load_dotenv
import os

load_dotenv()  # Load environment variables from .env file

db_name = os.getenv("DB_NAME")
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_host = os.getenv("DB_HOST")
db_port = os.getenv("DB_PORT")

# Database URL format: postgresql+asyncpg://user:password@host:port/dbname
DATABASE_URL = (
    f"postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
)

# Create the async engine
engine = create_async_engine(DATABASE_URL, echo=True)

# Create a session maker for handling requests
AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


# Dependency to get a database session for each API request
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

    # yield
    # await engine.dispose()


# task_db = [
#     { "id": 1, "title": "Task 1", "description": "This is task 1", "completed": False },
#     { "id": 2, "title": "Task 2", "description": "This is task 2", "completed": True },
#     { "id": 3, "title": "Task 3", "description": "This is task 3", "completed": False },
# ]

# def get_db():
#     # Placeholder for the actual database session retrieval logic
#     return task_db
