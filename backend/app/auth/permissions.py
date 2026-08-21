from app.auth.models import User

STAFF_ROLES = {"admin", "super_admin"}

ROLES_CREATABLE_BY = {
    "admin": {"student"},
    "super_admin": {"student", "admin"},
}


def is_staff(user: User) -> bool:
    return user.role in STAFF_ROLES


def roles_creatable_by(user: User) -> set[str]:
    return ROLES_CREATABLE_BY.get(user.role, set())
