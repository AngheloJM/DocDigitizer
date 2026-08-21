from app.auth.service import hash_password, verify_password


def test_hash_password_generates_verifiable_hash():
    password = "una_contrasena_segura"
    password_hash = hash_password(password)

    assert password_hash != password
    assert verify_password(password, password_hash)


def test_verify_password_rejects_wrong_password():
    password_hash = hash_password("una_contrasena_segura")

    assert not verify_password("otra_contrasena", password_hash)
