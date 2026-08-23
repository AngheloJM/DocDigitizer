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

## 3. Documentos

Ya funciona el flujo completo: subir el archivo, procesarlo (OCR + restauración de imagen + PDF/A) y descargarlo. Cuando subes un archivo, el documento pasa automáticamente por `pending` → `processing` → `completed` (unos segundos, según el tamaño). Puedes hacer polling sobre `/documents/{id}/status` para saber cuándo terminó.

Formatos aceptados: `png, jpg, jpeg, tiff, bmp, pdf`. Tamaño máximo: 20 MB.

Hay **tres formas** de crear/completar un documento, según el flujo de tu UI:

**A. Todo en un solo paso** (cuando ya tienes el archivo listo, ej. una foto recién tomada):
```
POST /documents/upload
multipart: file=<archivo>, title="...", doc_type? , folder_id?

→ 202 { document_id, task_id: null, status: "pending" }
```

**B. Registrar primero, escanear/subir después** (ej. el staff arma la lista de documentos pendientes de digitalizar, y va subiendo cada escaneo conforme lo procesa):
```
1) POST /documents          { title, description?, doc_type?, folder_id? }   → 201, documento sin archivo
2) POST /documents/{id}/upload   multipart: file=<archivo>                    → 202 { document_id, status }
```
Intentar subir un segundo archivo al mismo documento responde `409` (un documento solo tiene un archivo original).

**Resto de endpoints:**
```
GET    /documents?page=&per_page=&folder_id=&status_filter=&doc_type=  → 200 { items, total, page, pages }
GET    /documents/{id}                                                  → 200 (incluye original_image/generated_pdf/extracted_text si existen)
GET    /documents/{id}/status                                           → 200 { status, processed_at }
GET    /documents/{id}/download                                         → 200, archivo (PDF procesado, o el original si aun no termino)
POST   /documents/{id}/reprocess                                        → 202 { document_id, task_id, status: "reprocessing" }
PATCH  /documents/{id}      { title?, description?, doc_type?, folder_id? }  → 200
DELETE /documents/{id}                                                  → 204 (borra tambien el archivo de MinIO)
```

Estados posibles de `status`: `pending` → `processing` → `completed` (o `failed`). Sugerencia: después de subir, hacer polling a `/documents/{id}/status` cada 1-2 segundos hasta que sea `completed`, y ahí mostrar el botón de descarga / el texto extraído.

## 4. Búsqueda

```
GET /search?q=...&doc_type=&folder_id=&date_from=&date_to=&page=&per_page=
→ 200 { items: [{ document, highlight, rank }], total, page, pages }
```

`q` es obligatorio. `highlight` trae el fragmento del texto con las coincidencias marcadas como `<b>palabra</b>` (útil para mostrar directo en la UI). Solo encuentra documentos que ya terminaron de procesarse.

## 5. Qué NO está listo todavía

Nota para correr esto localmente: además de `docker compose up -d`, ahora también hay que levantar `docker compose up -d worker-ocr-pdf` (el procesador de OCR/PDF) para que los documentos pasen de `pending` a `completed`. Sin el worker corriendo, los documentos subidos se quedan en `pending` indefinidamente.

## 6. Errores comunes a manejar en el frontend

| Código | Cuándo pasa |
|---|---|
| 401 | Token vencido/inválido → intentar refresh, si falla ir a login |
| 403 | El usuario no tiene permiso para esa acción (ej. `student` intentando crear un usuario) |
| 404 | El recurso no existe o no te pertenece (no se distingue, por seguridad) |
| 422 | Body inválido (faltó un campo, formato incorrecto) — el detalle viene en `detail` |
| 429 | Rate limit de login |
