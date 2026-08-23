# DocDigitizer

Sistema de gestión, digitalización y organización automatizada de documentos.

## Estructura del repositorio

- `backend/` — API REST (FastAPI), procesamiento de documentos (OCR) y base de datos.
- `frontend/` — aplicación web (en desarrollo por el equipo de frontend).

> 👉 Si eres del equipo de frontend, revisa [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md) para ver exactamente qué puedes construir ya mismo, con ejemplos de cada request/response.

## Backend — guía rápida para el equipo de frontend

El backend expone documentación interactiva automática (Swagger) para probar los endpoints sin necesidad de escribir código.

### Cómo levantar el backend localmente

Requiere Docker Desktop instalado y corriendo.

```powershell
cd backend
docker compose up -d
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8001
```

### Dónde probar los endpoints

- **Swagger UI**: http://127.0.0.1:8001/docs — interfaz interactiva, con botón "Try it out" en cada endpoint y soporte para pegar el token JWT (botón de candado, arriba a la derecha) una vez que hagas login.
- **ReDoc**: http://127.0.0.1:8001/redoc — documentación de solo lectura, más limpia para consulta.
- **OpenAPI JSON**: http://127.0.0.1:8001/openapi.json — útil si quieren generar un cliente TypeScript automático (ej. `openapi-typescript`, `orval`) en vez de escribir los `fetch`/`axios` a mano.

### Endpoints disponibles

**Módulo `auth`** (`/api/v1/auth`):

No hay auto-registro público. Las cuentas siempre las crea alguien del staff (`admin` o `super_admin`).

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/auth/users` | Crea un usuario nuevo (`email`, `password`, `full_name`, `role`). Requiere ser `admin` o `super_admin` — ver matriz de roles abajo |
| POST | `/api/v1/auth/login` | `{email, password}` → `{access_token, refresh_token, token_type, expires_in}`. Bloquea con 429 tras 5 intentos fallidos en 15 min |
| POST | `/api/v1/auth/refresh` | `{refresh_token}` → nuevo `{access_token, refresh_token, ...}`. El refresh token es de un solo uso (rotación): una vez usado, queda invalido |
| GET | `/api/v1/auth/me` | Devuelve el usuario autenticado (requiere header `Authorization: Bearer <token>`) |

El `access_token` (JWT) dura 15 minutos. El `refresh_token` dura 7 días — el frontend debe guardarlo y usarlo contra `/auth/refresh` para renovar la sesión sin pedir contraseña de nuevo, y actualizar ambos tokens guardados cada vez (rotación).

**Roles y permisos:**

| Acción | `student` | `admin` | `super_admin` |
|---|---|---|---|
| Ver/gestionar sus propias carpetas y documentos | ✅ | ✅ | ✅ |
| Ver/gestionar carpetas y documentos de cualquier estudiante | ❌ | ✅ | ✅ |
| Crear usuarios `student` | ❌ | ✅ | ✅ |
| Crear usuarios `admin` | ❌ | ❌ | ✅ |
| Crear usuarios `super_admin` | ❌ | ❌ | ❌ (nadie, ni siquiera otro `super_admin`, vía API) |

El primer `super_admin` no se crea por API — se inserta una sola vez directamente en la base de datos (bootstrap). A partir de ahí, ese `super_admin` puede crear cuentas `admin`, y los `admin` pueden crear cuentas `student`.

**Módulo `folders`** (`/api/v1/folders`) — requiere header `Authorization: Bearer <token>` en todos los endpoints:

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/folders` | Crea una carpeta (`name`, `description` opcional, `parent_id` opcional para anidarla) |
| GET | `/api/v1/folders` | Lista carpetas del usuario; con `?parent_id=<id>` lista las subcarpetas de esa carpeta, sin el parámetro lista las carpetas raíz |
| GET | `/api/v1/folders/{folder_id}` | Obtiene una carpeta por id |
| PATCH | `/api/v1/folders/{folder_id}` | Actualiza nombre, descripción o mueve la carpeta a otro padre (bloquea ciclos: no se puede mover una carpeta dentro de si misma o de su propia subcarpeta) |
| DELETE | `/api/v1/folders/{folder_id}` | Elimina la carpeta |

**Módulo `documents`** (`/api/v1/documents`) — requiere `Authorization: Bearer <token>`:

✅ **El flujo completo ya funciona**: subir el archivo encola automáticamente el procesamiento (OCR + restauración de imagen + generación de PDF/A) en el worker de Celery. El documento pasa de `pending` → `processing` → `completed`, con `generated_pdf` y `extracted_text` ya llenos.

Para que el procesamiento corra, el worker debe estar levantado: `docker compose up -d worker-ocr-pdf` (usa Tesseract + Ghostscript instalados dentro del contenedor — no requieren instalarse en tu máquina).

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/documents` | Crea el registro de un documento sin archivo (`title`, `description`?, `doc_type`?, `folder_id`?) |
| POST | `/api/v1/documents/upload` | Crea el documento y sube el archivo en un solo paso (multipart: `file`, `title`, `description`?, `doc_type`?, `folder_id`?) |
| POST | `/api/v1/documents/{id}/upload` | Sube el archivo a un documento ya creado sin archivo (multipart: `file`). Responde `409` si el documento ya tiene uno |
| GET | `/api/v1/documents` | Lista paginada (`page`, `per_page`) con filtros `folder_id`, `status_filter`, `doc_type` |
| GET | `/api/v1/documents/{id}` | Detalle completo (incluye `original_image`, `generated_pdf`, `extracted_text` si ya existen) |
| GET | `/api/v1/documents/{id}/status` | Solo el estado — pensado para polling ligero desde el frontend |
| GET | `/api/v1/documents/{id}/download` | Descarga el PDF procesado (o el archivo original si aun no termino de procesarse) |
| PATCH | `/api/v1/documents/{id}` | Actualiza título, descripción, tipo o carpeta |
| DELETE | `/api/v1/documents/{id}` | Elimina el registro y su archivo en MinIO |

Formatos aceptados para subir: `png, jpg, jpeg, tiff, bmp, pdf`. Estados posibles: `pending`, `processing`, `completed`, `failed`, `reprocessing`. Todas las acciones relevantes (`register`, `upload`, `view`, `download`, `delete`) quedan registradas en `audit_log`.

**Módulo `processing`/`worker`**: pipeline de restauración de imagen (corrección de perspectiva, quitar ruido, binarización, enderezado) + OCR (Tesseract con fallback a EasyOCR) + generación de PDF/A con `ocrmypdf`. Corre como tarea de Celery, encolada automáticamente al subir un documento. Requiere Ghostscript (por eso corre en un contenedor Docker — `backend/Dockerfile` — en vez de instalarse directo en cada máquina de desarrollo).

**Búsqueda** (`GET /api/v1/search`) — requiere `Authorization: Bearer <token>`:

| Parámetro | Descripción |
|---|---|
| `q` (requerido) | Texto a buscar, en español, con lematización (ej. "calificación" encuentra "calificaciones") |
| `doc_type`, `folder_id`, `date_from`, `date_to` | Filtros opcionales |
| `owner_id` | Solo para `admin`/`super_admin`: buscar en documentos de otro usuario |
| `page`, `per_page` | Paginación |

Respuesta: `{items: [{document, highlight, rank}], total, page, pages}`, donde `highlight` resalta las coincidencias con `<b>...</b>` y `rank` indica qué tan relevante es el resultado (mayor = más relevante). Solo encuentra documentos que ya terminaron de procesarse (con `extracted_text`).

### Nota sobre el puerto

Usamos el puerto `8001` para este proyecto (no `8000`) para evitar choques con otros proyectos locales corriendo en la misma máquina.

## ¿Qué son Redis y MinIO, y por qué el backend los necesita?

**Redis** es una base de datos en memoria ultra rápida. Aquí se usa como *broker* de Celery: cuando alguien sube un documento, el procesamiento (OCR, restauración de imagen, generación de PDF) es pesado y no puede resolverse en el mismo instante de la petición HTTP sin bloquear al usuario. La API encola la tarea en Redis y responde de inmediato; un *worker* de Celery aparte va tomando esas tareas de la cola y las procesa en segundo plano.

**MinIO** es un servidor de almacenamiento de objetos compatible con la API de Amazon S3, pero que corre localmente en vez de depender de la nube. Se usa para guardar los archivos binarios (imágenes originales subidas y PDFs generados), porque las bases de datos relacionales como PostgreSQL no están pensadas para almacenar archivos grandes de forma eficiente — PostgreSQL solo guarda los metadatos (nombre, tamaño, estado, propietario), y el archivo real vive en MinIO. Al ser compatible con S3, si en producción se migra a Amazon S3 real, el código no cambia, solo la configuración de conexión.
