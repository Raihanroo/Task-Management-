from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from db_base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    role = Column(String, nullable=False, default="user")
    # Soft delete: row stays so projects/tasks keep their owner/assignee references
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=False, default="")
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_member"),)

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    can_edit = Column(Boolean, nullable=False, default=False)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(String, index=True, nullable=False)
    completed = Column(Boolean, nullable=False, default=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)


class SystemLimit(Base):
    __tablename__ = "system_limits"

    id = Column(Integer, primary_key=True, default=1)
    max_projects_per_user = Column(Integer, nullable=False, default=5)
    max_tasks_per_user = Column(Integer, nullable=False, default=20)
    max_tasks_per_project = Column(Integer, nullable=False, default=50)

class UserLimit(Base):
    """Per-user quota overrides. A NULL column means 'use the global default'."""

    __tablename__ = "user_limits"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    max_projects = Column(Integer, nullable=True)
    max_tasks = Column(Integer, nullable=True)
    max_tasks_per_project = Column(Integer, nullable=True)
