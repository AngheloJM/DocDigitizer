# Guía para el equipo de Frontend

Este documento resume qué puedes construir **ya mismo** contra el backend, cómo funciona cada flujo, y qué falta todavía. Se actualiza a medida que se integran nuevos módulos a `main`.

## Estado actual (2026-08-29)

**✅ Ya construido y funcionando en producción:**
- Login con branding UTEPSA (`src/app/login/page.tsx`), sesión con cookies httpOnly, renovación automática del access token antes de que expire (single-flight lock, sin condición de carrera) y limpieza de cookies al cerrar sesión.
- Dashboard shell (Sidebar, TopBar con búsqueda rápida).
- **Carpetas** (`/carpetas`): listar, crear, eliminar, navegar subcarpetas (`?parent_id=`), ver documentos dentro de una carpeta.
- **Documentos** (`/documentos`): listar con filtros (año archivado, estante, estado), columnas de período/ubicación física, subir en un solo paso o adjuntar escaneo a un documento ya registrado sin archivo, polling de estado, descargar cuando está `completed`.
- **Búsqueda** (`/busqueda`): búsqueda simple por texto (`q`), muestra período/ubicación, resalta coincidencias.
- **Usuarios** (`/usuarios`): listar usuarios en tu alcance, activar/desactivar.
- Admin/super_admin ven documentos y carpetas de **todos** los usuarios por defecto (antes solo veían lo propio) — ver sección 3.
- Campo `assigned_to_id` en documentos (staff puede asignar un documento a otro usuario sin cambiar el dueño) — ver sección 3.

**⏳ Pendiente — prioridad alta:**

1. **UI para asignar documentos a un usuario** — el backend ya soporta `assigned_to_id` (`PATCH /documents/{id}`, solo staff), pero no hay ningún selector en `/documentos` para elegir a quién asignarle un documento. Caso de uso real: un admin reparte los 289 documentos migrados entre varios usuarios para que cada uno digitalice/revise los suyos.
2. **Indicador de "asignado a mí"** — un usuario no-staff que tiene documentos asignados (no propios) hoy los va a ver mezclados en `/documentos` sin distinguir cuáles son suyos y cuáles le asignaron; falta una columna o filtro visual para eso.

**⏳ Pendiente — prioridad media:**

3. **Editar documento** (`PATCH /documents/{id}`) — no hay UI para corregir título, tipo, carpeta o ubicación física de un documento ya creado.
4. **Crear usuarios** (`POST /auth/users`) y **cambiar de rol** (`PATCH /auth/users/{id}` con `role`) — `/usuarios` solo permite activar/desactivar, no crear cuentas nuevas ni cambiar el rol de una existente.
5. **Reprocesar documento** (`POST /documents/{id}/reprocess`) — útil para cuando mejoramos el pipeline de OCR (como pasó esta semana) y se quiere reprocesar un documento ya subido sin tener que volver a escanearlo.
6. **Filtros avanzados de búsqueda** — `/busqueda` solo usa `q`; el backend también soporta `doc_type`, `date_from`, `date_to`, `folder_id`, `owner_id`.

Ninguno de estos bloquea el uso básico del sistema.

## Ideas de diseño de referencia (31/08/2026)

Un compañero de curso armó un mockup visual del mismo tipo de sistema (React + Vite, 100% datos simulados en memoria, sin backend real — carpeta `pruebas/` en este repo, no confundir con nuestro frontend real). No es código para copiar (es otro framework, otro modelo de datos, y no habla con nuestra API), pero tiene ideas de UX que valen la pena portar a nuestras pantallas reales:

7. **Dashboard/inicio con resumen y "actividad reciente"** — hoy el login redirige directo a `/carpetas`; no existe ninguna pantalla de inicio. Se podría armar una página `/` (o `/inicio`) con: tarjetas de resumen (total de documentos, pendientes, completados), y una lista de los últimos 5-10 documentos actualizados (`GET /documents?per_page=5` ordenado por fecha, que ya viene ordenado por `created_at desc`).
8. **Mapa visual de estantes en `/carpetas`** — un bloque arriba de la lista de carpetas con casilleros numerados (uno por cada valor distinto de `physical_shelf` que ya exista en los documentos), para ubicar de un vistazo qué estantes tienen contenido. Encaja directo con los campos `physical_shelf`/`physical_division`/`physical_column`/`physical_volume` que ya tenemos.
9. **Buscador de categorías/carpetas por texto** dentro de `/carpetas` — un input simple que filtre la lista de carpetas ya cargada por nombre, sin pegarle de nuevo al backend.
10. **Vista tabla/grilla intercambiable** en `/documentos` — un botón para alternar entre la tabla actual y una vista de tarjetas.

⚠️ **Ojo con esto:** en ese mockup, debajo del mapa y la grilla de carpetas hay una tercera sección ("Estructura documental / Taxonomía institucional") que repite la misma lista de carpetas con los mismos conteos, en formato de lista plana — es puramente redundante con la grilla de arriba, no aporta nada nuevo. **No la repliquen** si toman ideas de ese mockup.

**Fuera de alcance por ahora (requeriría cambios de backend, no solo de frontend):** ese mockup también tiene un módulo de "recordatorios" (documentos con fecha de vencimiento, semáforo vigente/por vencer/vencido) y un campo de "rango de folios" dentro de la ubicación física. Ninguno de los dos existe en nuestro modelo de datos actual (`documents` no tiene fecha de vencimiento ni rango de folios) — si se decide que aplica al caso real de UTEPSA (por ejemplo, convenios institucionales con fecha de vencimiento), habría que diseñarlo primero como feature de backend antes de construir la UI.

## Antes de empezar

Levanta el backend localmente siguiendo la sección "Backend — guía rápida para el equipo de frontend" del [README.md](README.md). Una vez arriba:

- Base URL local: `http://127.0.0.1:8001/api/v1`
- Swagger interactivo local: `http://127.0.0.1:8001/docs`
- CORS local ya está habilitado para `http://localhost:3000` (el puerto por defecto de Next.js). Si usas otro puerto, avisa para agregarlo.

**Producción (ya desplegado):**
- Base URL: `https://docdigitizer.onrender.com/api/v1`
- Swagger: `https://docdigitizer.onrender.com/docs`
- Frontend real: `https://doc-digitizer-nine.vercel.app`
- `CORS_ALLOWED_ORIGINS` está temporalmente en `["*"]` en el backend de producción — se va a restringir a la URL de Vercel apenas se confirme que el frontend quedó estable, así que no dependas de que siga siendo `"*"` a futuro.
- ⚠️ El backend de producción corre en el free tier de Render: la primera petición después de un rato de inactividad puede tardar 30-50 segundos en responder mientras el servicio "despierta". No es un bug, es una limitación del plan gratuito — si vas a hacer demos, haz un request de calentamiento (ej. `GET /health`) unos segundos antes.

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

**Gestionar usuarios existentes** (solo `admin`/`super_admin`):
```
GET   /auth/users?role_filter=&page=&per_page=   → 200 { items, total, page, pages }
GET   /auth/users/{id}                            → 200 (404 si no esta en tu alcance)
PATCH /auth/users/{id}   { role?, is_active? }     → 200
```
Un `admin` solo ve/gestiona `student`; un `super_admin` ve/gestiona `admin` y `student` (nadie ve otros `super_admin` por API). Desactivar a alguien (`is_active: false`) le bloquea el login inmediatamente (403) y también invalida cualquier sesión que ya tuviera abierta.

**Crear usuario nuevo** (solo `admin`/`super_admin`, no implementado en la UI todavía — ver "Pendiente — prioridad media"):
```
POST /auth/users   { email, password, full_name, role }   → 201
```
Un `admin` solo puede crear `student`; un `super_admin` puede crear `student` o `admin` (nadie puede crear `super_admin` por API, ni siquiera otro `super_admin`).

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

✅ Si el archivo es un PDF de varias páginas, se procesan **todas** — el PDF/A generado y el texto extraído cubren el documento completo, no solo la primera página.

> ⚠️ Para el equipo de frontend: `documentos/page.tsx:213` todavía dice "Si el PDF tiene varias páginas, solo se procesa la primera." — ese mensaje ya quedó desactualizado (26/08/2026) y debería quitarse o corregirse.

Hay **tres formas** de crear/completar un documento, según el flujo de tu UI:

**A. Todo en un solo paso** (cuando ya tienes el archivo listo, ej. una foto recién tomada):
```
POST /documents/upload
multipart: file=<archivo>, title="...", doc_type? , folder_id?

→ 202 { document_id, task_id: null, status: "pending" }
```

**B. Registrar primero, escanear/subir después** (ej. el staff arma la lista de documentos pendientes de digitalizar, y va subiendo cada escaneo conforme lo procesa) — **este es el flujo que falta construir en el frontend, ver "Pendiente — prioridad alta" arriba**:
```
1) POST /documents          { title, description?, doc_type?, folder_id?, physical_shelf?, physical_division?, physical_column?, physical_volume?, archived_year?, archived_month_start?, archived_month_end? }   → 201, documento sin archivo
2) POST /documents/{id}/upload   multipart: file=<archivo>                    → 202 { document_id, status }
```
Intentar subir un segundo archivo al mismo documento responde `409` (un documento solo tiene un archivo original).

Ahora mismo hay **289 documentos reales** ya en este estado (creados sin archivo, migrados desde el sistema anterior del archivo físico) — la UI necesita mostrar estos documentos `pending` y ofrecer el botón de "subir escaneo" (paso 2) para cada uno.

Los campos `physical_*` (`physical_shelf`, `physical_division`, `physical_column`, `physical_volume`, todos `string`) son opcionales y catalogan dónde está guardado físicamente el documento (estante/división/columna/tomo).

Los campos `archived_year` (`int`), `archived_month_start`/`archived_month_end` (`int`, 1-12, `month_end` opcional si es un único mes) son opcionales y catalogan **el período que cubre el contenido archivado** — distinto de `created_at`, que es cuándo se subió el registro al sistema. Ej: un tomo con actas de "Enero a Abril 2023" se guarda como `archived_year: 2023, archived_month_start: 1, archived_month_end: 4`.

Todos estos campos (`physical_*` y `archived_*`) se pueden pasar en la creación o agregar/corregir después con `PATCH /documents/{id}`.

**Resto de endpoints:**
```
GET    /documents?page=&per_page=&folder_id=&status_filter=&doc_type=&physical_shelf=&archived_year=&owner_id=&assigned_to_id=  → 200 { items, total, page, pages }
GET    /documents/{id}                                                  → 200 (incluye original_image/generated_pdf/extracted_text si existen)
GET    /documents/{id}/status                                           → 200 { status, processed_at }
GET    /documents/{id}/download                                         → 200, archivo (PDF procesado, o el original si aun no termino)
POST   /documents/{id}/reprocess                                        → 202 { document_id, task_id, status: "reprocessing" }
PATCH  /documents/{id}      { title?, description?, doc_type?, folder_id?, assigned_to_id? }  → 200
DELETE /documents/{id}                                                  → 204 (borra tambien el archivo de MinIO)
```

Estados posibles de `status`: `pending` → `processing` → `completed` (o `failed`). Sugerencia: después de subir, hacer polling a `/documents/{id}/status` cada 1-2 segundos hasta que sea `completed`, y ahí mostrar el botón de descarga / el texto extraído.

**Visibilidad y asignación (nuevo, 29/08/2026):**
- `admin`/`super_admin` ven documentos y carpetas de **todos** los usuarios por defecto en `GET /documents` y `GET /folders` (antes solo veían lo propio salvo que pasaran `?owner_id=`). `?owner_id=<id>` sigue funcionando para acotar a un usuario puntual.
- Nuevo campo `assigned_to_id` (UUID, opcional) en `documents`, independiente de `user_id` (el dueño real). Sirve para que un admin le asigne un documento a otro usuario (staff o `student`) sin transferirle la propiedad — por ejemplo, repartir los 289 documentos migrados entre varias personas para que cada una digitalice/revise los suyos.
- Solo `admin`/`super_admin` pueden poner o cambiar `assigned_to_id` (via `POST /documents` o `PATCH /documents/{id}`) — un `student` que lo intente recibe `400`. Asignar a un usuario que no existe también responde `400`.
- El usuario asignado (aunque no sea `student` propietario) puede ver ese documento en `GET /documents`, `GET /documents/{id}`, subirle el archivo, descargarlo, etc. — mismo acceso que si fuera el dueño, aunque `user_id` no cambia.
- Filtrar por asignado: `GET /documents?assigned_to_id=<user_id>`.

## 4. Búsqueda

```
GET /search?q=...&doc_type=&folder_id=&date_from=&date_to=&page=&per_page=
→ 200 { items: [{ document, highlight, rank }], total, page, pages }
```

`q` es obligatorio. `highlight` trae el fragmento del texto con las coincidencias marcadas como `<b>palabra</b>` (útil para mostrar directo en la UI). Solo encuentra documentos que ya terminaron de procesarse.

## 5. Qué NO está listo todavía

Nota para correr esto localmente: además de `docker compose up -d`, ahora también hay que levantar `docker compose up -d worker-ocr-pdf` (el procesador de OCR/PDF) para que los documentos pasen de `pending` a `completed`. Sin el worker corriendo, los documentos subidos se quedan en `pending` indefinidamente.

Pendientes conocidos del backend (no bloquean el desarrollo del frontend, pero ten presente que no existen todavía):
- Revocación explícita de refresh tokens en logout (hoy expiran solos a los 7 días, no hay invalidación anticipada del lado del servidor más allá de la rotación de un solo uso).
- Rate limiting solo existe en `/auth/login`; el resto de endpoints no lo tiene.

## 6. Errores comunes a manejar en el frontend

| Código | Cuándo pasa |
|---|---|
| 401 | Token vencido/inválido → intentar refresh, si falla ir a login |
| 403 | El usuario no tiene permiso para esa acción (ej. `student` intentando crear un usuario) |
| 404 | El recurso no existe o no te pertenece (no se distingue, por seguridad) |
| 422 | Body inválido (faltó un campo, formato incorrecto) — el detalle viene en `detail` |
| 429 | Rate limit de login |
