"""Add user_limits table (per-user quota overrides).

Revision ID: 0003_user_limits
Revises: 0002_user_soft_delete
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_user_limits"
down_revision = "0002_user_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_limits",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("max_projects", sa.Integer(), nullable=True),
        sa.Column("max_tasks", sa.Integer(), nullable=True),
        sa.Column("max_tasks_per_project", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("user_limits")
