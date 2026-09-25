"""eliminar modulo de carpetas (folder_id en documents y tabla folders)

Nadie usaba las carpetas manuales en produccion (organizacion arbitraria,
sin relacion con la ubicacion fisica real del archivo). Se retiro la
pantalla /carpetas hace un tiempo, y ahora se retira tambien la columna
folder_id de documents y la tabla folders en si.

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("idx_documents_folder", table_name="documents")
    op.drop_column("documents", "folder_id")

    op.drop_index("idx_folders_parent_id", table_name="folders")
    op.drop_index("idx_folders_user_id", table_name="folders")
    op.drop_table("folders")


def downgrade() -> None:
    op.create_table(
        "folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("folders.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_folders_user_id", "folders", ["user_id"])
    op.create_index("idx_folders_parent_id", "folders", ["parent_id"])

    op.add_column(
        "documents",
        sa.Column("folder_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("idx_documents_folder", "documents", ["folder_id"])
