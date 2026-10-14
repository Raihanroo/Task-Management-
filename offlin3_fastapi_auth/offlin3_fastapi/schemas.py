from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, model_validator


class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserResponse(UserBase):
    # plain str: soft-deleted users carry a placeholder '@deleted.invalid' address
    # that EmailStr (response validation) would reject.
    email: str
    id: int
    is_active: bool
    role: str
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class UserRegister(UserBase):
    password: str = Field(min_length=8)


class UserRegisterResponse(UserResponse):
    pass


class UserLogin(BaseModel):
    username: str
    password: str


class UserLoginResponse(BaseModel):
    message: str
    id: int
    username: str
    email: EmailStr
    access_token: str
    token_type: str = "bearer"


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""


class ProjectUpdate(BaseModel):
    """Project metadata only (owner/admin). Owner and members are not editable here."""

    title: str | None = Field(default=None, min_length=1)
    description: str | None = None


class ProjectResponse(BaseModel):
    id: int
    title: str
    description: str
    owner_id: int

    model_config = ConfigDict(from_attributes=True)


class ProjectMemberCreate(BaseModel):
    """Add by username (frontend) or by user_id (Swagger/legacy). One of the two is required."""

    user_id: int | None = None
    username: str | None = Field(default=None, min_length=1)
    can_edit: bool = False

    @model_validator(mode="after")
    def _need_user_ref(self):
        if self.user_id is None and not (self.username and self.username.strip()):
            raise ValueError("Provide either username or user_id")
        return self


class ProjectMemberPermissionUpdate(BaseModel):
    can_edit: bool


class ProjectMemberResponse(BaseModel):
    id: int
    project_id: int
    user_id: int
    username: str | None = None
    can_edit: bool

    model_config = ConfigDict(from_attributes=True)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = ""
    assigned_to_id: int | None = None
    assigned_to_username: str | None = None


class TaskCreateAny(TaskCreate):
    """POST /tasks body: project_id=None -> personal standalone task."""

    project_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    completed: bool | None = None
    assigned_to_id: int | None = None
    assigned_to_username: str | None = None

class TaskStatusUpdate(BaseModel):
    completed: bool

class TaskResponse(BaseModel):
    id: int
    title: str
    description: str
    completed: bool
    project_id: int | None
    assigned_to_id: int | None
    created_by_id: int | None

    model_config = ConfigDict(from_attributes=True)


class SystemLimitUpdate(BaseModel):
    max_projects_per_user: int = Field(ge=1)
    max_tasks_per_user: int = Field(ge=1)
    max_tasks_per_project: int = Field(ge=1)


class SystemLimitResponse(SystemLimitUpdate):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ---------------- Admin dashboard contracts ----------------
class PaginatedUsersResponse(BaseModel):
    total_users: int
    total_pages: int
    page: int
    limit: int
    offset: int
    users: list[UserResponse]


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserLimitsUpdate(BaseModel):
    max_projects: int | None = Field(default=None, ge=1)
    max_tasks: int | None = Field(default=None, ge=1)
    max_tasks_per_project: int | None = Field(default=None, ge=1)


class UserLimitsResponse(BaseModel):
    user_id: int
    max_projects: int | None = None
    max_tasks: int | None = None
    max_tasks_per_project: int | None = None


class UserDetailResponse(BaseModel):
    user: UserResponse
    projects_count: int
    tasks_count: int
    effective_max_projects: int
    effective_max_tasks: int
    effective_max_tasks_per_project: int


class SystemSettingsResponse(BaseModel):
    id: int
    default_max_projects_per_user: int
    default_max_tasks_per_user: int
    default_max_tasks_per_project: int


class SystemSettingsUpdate(BaseModel):
    default_max_projects_per_user: int | None = Field(default=None, ge=1)
    default_max_tasks_per_user: int | None = Field(default=None, ge=1)
    default_max_tasks_per_project: int | None = Field(default=None, ge=1)


class MyProjectAccess(BaseModel):
    role: str  # owner | admin | editor | viewer
    is_owner: bool
    can_edit: bool
    can_manage_members: bool
