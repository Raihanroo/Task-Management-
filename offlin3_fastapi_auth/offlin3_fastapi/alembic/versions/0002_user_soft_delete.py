"""Add users.deleted_at for soft delete.

Revision ID: 0002_user_soft_delete
Revises: 0001_initial_schema
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_user_soft_delete"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "deleted_at")
