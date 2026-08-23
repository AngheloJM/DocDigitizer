# Guía para el equipo de Frontend

Este documento resume qué puedes construir **ya mismo** contra el backend, cómo funciona cada flujo, y qué falta todavía. Se actualiza a medida que se integran nuevos módulos a `main`.

## Antes de empezar

Levanta el backend localmente siguiendo la sección "Backend — guía rápida para el equipo de frontend" del [README.md](README.md). Una vez arriba:

- Base URL: `http://127.0.0.1:8001/api/v1`
- Swagger interactivo: `http://127.0.0.1:8001/docs`
- CORS ya está habilitado para `http://localhost:3000` (el puerto por defecto de Next.js). Si usas otro puerto, avisa para agregarlo.

Todos los endpoints salvo `login` y `refresh` requieren el header:
```
Authorization: Bearer <access_token>
```

## 1. Login y sesión

No hay auto-registro: las cuentas las crea el staff. Pide credenciales de prueba al equipo de backend para desarrollar.

**Login**
```
POST /auth/login
{ "email": "...", "password": "..." }

→ 200
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "expires_in": 900
}
```
- `access_token`: dura 15 minutos. Úsalo en el header `Authorization`.
- `refresh_token`: dura 7 días, **de un solo uso**. Guárdalo también.
- `429`: demasiados intentos fallidos (5 en 15 min) — muestra un mensaje de "espera unos minutos", no un error genérico.

**Renovar sesión (antes de que expire el access_token, o al recibir 401)**
```
POST /auth/refresh
{ "refresh_token": "..." }

→ 200 { access_token, refresh_token, token_type, expires_in }
```
Importante: cada llamada a `/refresh` invalida el `refresh_token` usado y entrega uno nuevo. Guarda siempre el par más reciente (access + refresh), no solo el access.

**Usuario actual**
```
GET /auth/me
→ 200 { id, email, full_name, role, is_active }
```
`role` es uno de `student`, `admin`, `super_admin` — útil para decidir qué mostrar en la UI (ej. un estudiante no debería ver el botón de "ver documentos de otros").

### Sugerencia de manejo de sesión en el frontend
- Guarda `access_token` y `refresh_token` (ej. en memoria + `refresh_token` en storage seguro).
- Interceptor HTTP: si una petición devuelve `401`, intenta `/auth/refresh` una vez y reintenta la petición original; si el refresh también falla, redirige a login.

## 2. Carpetas

```
POST   /folders              { name, description?, parent_id? }        → 201
GET    /folders?parent_id=    lista carpetas (raíz si no se pasa parent_id) → 200 [ ... ]
GET    /folders/{id}                                                    → 200
PATCH  /folders/{id}          { name?, description?, parent_id? }       → 200
DELETE /folders/{id}                                                    → 204
```
- Mover una carpeta dentro de sí misma o de su propia subcarpeta responde `400`.
- `admin`/`super_admin` pueden ver/editar carpetas de cualquier usuario pasando `?owner_id=<user_id>` en `GET /folders`, o accediendo directo a `GET /folders/{id}` de otro usuario.

## 3. Documentos (solo metadatos por ahora)

⚠️ Todavía **no se puede subir el archivo real**. Estos endpoints sirven para construir la UI de listado/organización mientras se conecta el módulo de subida (`storage`). Un documento creado queda en estado `pending` sin imagen ni PDF asociado.

```
POST   /documents             { title, description?, doc_type?, folder_id? }  → 201
GET    /documents?page=&per_page=&folder_id=&status_filter=&doc_type=          → 200 { items, total, page, pages }
GET    /documents/{id}                                                         → 200 (incluye original_image/generated_pdf/extracted_text si existen)
GET    /documents/{id}/status                                                  → 200 { status, processed_at }
PATCH  /documents/{id}         { title?, description?, doc_type?, folder_id? }  → 200
DELETE /documents/{id}                                                         → 204
```

Estados posibles de `status`: `pending`, `processing`, `completed`, `failed`, `reprocessing`. Puedes ya construir:
- El listado paginado con filtros.
- La vista de detalle (mostrará los campos de imagen/PDF/texto como `null` hasta que exista `storage`).
- Polling simple sobre `/documents/{id}/status` para cuando sí haya procesamiento real.

## 4. Qué NO está listo todavía

- **Subir el archivo real** (`storage`/MinIO) — el botón de "subir foto/escaneo" no tiene backend todavía.
- **OCR y generación de PDF** (`processing`/`worker`) — depende de lo anterior.
- **Búsqueda full-text** (`/search`) — la base de datos ya lo soporta (probado), pero el endpoint HTTP no existe aún.

## 5. Errores comunes a manejar en el frontend

| Código | Cuándo pasa |
|---|---|
| 401 | Token vencido/inválido → intentar refresh, si falla ir a login |
| 403 | El usuario no tiene permiso para esa acción (ej. `student` intentando crear un usuario) |
| 404 | El recurso no existe o no te pertenece (no se distingue, por seguridad) |
| 422 | Body inválido (faltó un campo, formato incorrecto) — el detalle viene en `detail` |
| 429 | Rate limit de login |
