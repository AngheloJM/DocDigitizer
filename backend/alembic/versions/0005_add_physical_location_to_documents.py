"""agregar columnas de ubicacion fisica a documents

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("physical_shelf", sa.String(50), nullable=True))
    op.add_column("documents", sa.Column("physical_division", sa.String(50), nullable=True))
    op.add_column("documents", sa.Column("physical_column", sa.String(50), nullable=True))
    op.add_column("documents", sa.Column("physical_volume", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "physical_volume")
    op.drop_column("documents", "physical_column")
    op.drop_column("documents", "physical_division")
    op.drop_column("documents", "physical_shelf")
