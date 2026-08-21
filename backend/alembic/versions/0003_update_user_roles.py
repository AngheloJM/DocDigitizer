"""actualizar roles de usuario a student/admin/super_admin

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.execute("UPDATE users SET role = 'super_admin' WHERE role = 'admin'")
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'admin_staff'")
    op.create_check_constraint(
        "ck_users_role", "users", "role IN ('student', 'admin', 'super_admin')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.execute("UPDATE users SET role = 'admin_staff' WHERE role = 'admin'")
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'super_admin'")
    op.create_check_constraint(
        "ck_users_role", "users", "role IN ('student', 'admin_staff', 'admin')"
    )
