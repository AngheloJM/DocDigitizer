from app.auth.models import User

PRIVILEGED_ROLES = {"admin", "admin_staff"}


def is_privileged(user: User) -> bool:
    return user.role in PRIVILEGED_ROLES
