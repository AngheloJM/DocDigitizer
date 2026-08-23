# DocDigitizer

Sistema de gestión, digitalización y organización automatizada de documentos.

## Estructura del repositorio

- `backend/` — API REST (FastAPI), procesamiento de documentos (OCR) y base de datos.
- `frontend/` — aplicación web (en desarrollo por el equipo de frontend).

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

⚠️ **Alcance actual**: estos endpoints manejan solo los **metadatos** del documento (título, tipo, carpeta, estado). Todavía no se puede subir el archivo real (eso requiere el módulo `storage`/MinIO) ni se genera el PDF/OCR (eso requiere `processing`/`worker`). Por ahora todo documento creado queda en estado `pending` sin archivo asociado — esto se completa cuando esos módulos se integren.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/documents` | Crea el registro de un documento (`title`, `description` opcional, `doc_type` opcional, `folder_id` opcional) |
| GET | `/api/v1/documents` | Lista paginada (`page`, `per_page`) con filtros `folder_id`, `status_filter`, `doc_type` |
| GET | `/api/v1/documents/{id}` | Detalle completo (incluye `original_image`, `generated_pdf`, `extracted_text` si ya existen) |
| GET | `/api/v1/documents/{id}/status` | Solo el estado — pensado para polling ligero desde el frontend |
| PATCH | `/api/v1/documents/{id}` | Actualiza título, descripción, tipo o carpeta |
| DELETE | `/api/v1/documents/{id}` | Elimina el registro |

Estados posibles: `pending`, `processing`, `completed`, `failed`, `reprocessing`. Todas las acciones relevantes (`upload`, `view`, `delete`) quedan registradas en `audit_log`.

El resto de módulos (`storage`, `processing`) se van agregando por rama (`backend/<modulo>`) y se documentan aquí a medida que se integran a `main`.

### Nota sobre el puerto

Usamos el puerto `8001` para este proyecto (no `8000`) para evitar choques con otros proyectos locales corriendo en la misma máquina.

## ¿Qué son Redis y MinIO, y por qué el backend los necesita?

**Redis** es una base de datos en memoria ultra rápida. Aquí se usa como *broker* de Celery: cuando alguien sube un documento, el procesamiento (OCR, restauración de imagen, generación de PDF) es pesado y no puede resolverse en el mismo instante de la petición HTTP sin bloquear al usuario. La API encola la tarea en Redis y responde de inmediato; un *worker* de Celery aparte va tomando esas tareas de la cola y las procesa en segundo plano.

**MinIO** es un servidor de almacenamiento de objetos compatible con la API de Amazon S3, pero que corre localmente en vez de depender de la nube. Se usa para guardar los archivos binarios (imágenes originales subidas y PDFs generados), porque las bases de datos relacionales como PostgreSQL no están pensadas para almacenar archivos grandes de forma eficiente — PostgreSQL solo guarda los metadatos (nombre, tamaño, estado, propietario), y el archivo real vive en MinIO. Al ser compatible con S3, si en producción se migra a Amazon S3 real, el código no cambia, solo la configuración de conexión.
