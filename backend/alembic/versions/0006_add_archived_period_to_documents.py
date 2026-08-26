"""agregar columnas de periodo archivado (anio/mes) a documents

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "documents", "doc_type", type_=sa.String(100), existing_type=sa.String(50)
    )
    op.add_column("documents", sa.Column("archived_year", sa.Integer(), nullable=True))
    op.add_column("documents", sa.Column("archived_month_start", sa.Integer(), nullable=True))
    op.add_column("documents", sa.Column("archived_month_end", sa.Integer(), nullable=True))
    op.create_index(
        "ix_documents_archived_year", "documents", ["archived_year"], unique=False
    )
    op.create_check_constraint(
        "ck_documents_archived_month_start",
        "documents",
        "archived_month_start IS NULL OR archived_month_start BETWEEN 1 AND 12",
    )
    op.create_check_constraint(
        "ck_documents_archived_month_end",
        "documents",
        "archived_month_end IS NULL OR archived_month_end BETWEEN 1 AND 12",
    )


def downgrade() -> None:
    op.drop_constraint("ck_documents_archived_month_end", "documents", type_="check")
    op.drop_constraint("ck_documents_archived_month_start", "documents", type_="check")
    op.drop_index("ix_documents_archived_year", table_name="documents")
    op.drop_column("documents", "archived_month_end")
    op.drop_column("documents", "archived_month_start")
    op.drop_column("documents", "archived_year")
    op.alter_column(
        "documents", "doc_type", type_=sa.String(50), existing_type=sa.String(100)
    )
