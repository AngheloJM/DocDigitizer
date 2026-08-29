"""agregar assigned_to_id a documents

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("assigned_to_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_documents_assigned_to_id", "documents", ["assigned_to_id"], unique=False
    )
    op.create_foreign_key(
        "fk_documents_assigned_to_id_users",
        "documents",
        "users",
        ["assigned_to_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_documents_assigned_to_id_users", "documents", type_="foreignkey")
    op.drop_index("ix_documents_assigned_to_id", table_name="documents")
    op.drop_column("documents", "assigned_to_id")
