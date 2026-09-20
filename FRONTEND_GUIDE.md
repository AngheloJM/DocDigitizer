# Guía para el equipo de Frontend

Este documento resume qué puedes construir **ya mismo** contra el backend, cómo funciona cada flujo, y qué falta todavía. Se actualiza a medida que se integran nuevos módulos a `main`.

> 🔧 **Ronda de hardening de backend (14/09/2026):** se mezclaron 7 PRs de endurecimiento (rate limiting en el resto de endpoints, reintentos automáticos del pipeline, mensaje de error visible, blacklist de tokens al cerrar sesión, revocar todas las sesiones, soft-delete de documentos, y reseteo de contraseña por super_admin). El detalle de cada uno está en las secciones correspondientes más abajo — buscá los bloques marcados como **(nuevo, 14/09/2026)**.

## Estado actual (2026-09-20)

**✅ Ya construido y funcionando en producción:**
- Login con branding UTEPSA (`src/app/login/page.tsx`), sesión con cookies httpOnly, renovación automática del access token antes de que expire (single-flight lock, sin condición de carrera) y limpieza de cookies al cerrar sesión.
- Dashboard shell (Sidebar, TopBar con búsqueda rápida).
- **Inicio** (`/inicio`, nuevo 13/09/2026): resumen con total, pendientes y completados, y los últimos documentos registrados. El login ya no redirige a `/carpetas`.
- **Ubicación física** (`/ubicacion`, nuevo 10/09/2026): navega el archivo real (estante → división → columna → tomo) usando `GET /documents/locations`, con breadcrumbs y lista de documentos al llegar al último nivel.
- **Carpetas** (`/carpetas`): listar, crear, eliminar, navegar subcarpetas (`?parent_id=`), ver documentos dentro de una carpeta.
- **Documentos** (`/documentos`): listar con filtros (año archivado, rango de mes archivado, estante, estado, asignación — nuevo 17/09/2026), paginación de a 10 (ordenado del más reciente al más antiguo), columnas de período/ubicación física/asignación, subir en un solo paso o adjuntar escaneo a un documento ya registrado sin archivo, polling de estado, descargar cuando está `completed`.
- **Editar documento** (`DocumentEditModal`): título, tipo, carpeta (árbol jerárquico), ubicación física y período archivado. Visible para staff, el dueño, o el usuario asignado.
- **Asignación de documentos**: el staff puede asignarle cualquier documento a un usuario activo desde un selector en la tabla; indicador visual y filtro "Asignados a mí".
- **Búsqueda** (`/busqueda`): búsqueda simple por texto (`q`), muestra período/ubicación, resalta coincidencias.
- **Usuarios** (`/usuarios`): listar usuarios en tu alcance, activar/desactivar, **crear cuentas nuevas**, **cambiar de rol**, **resetear contraseña** (solo `super_admin`) y **cerrar sesiones** de otro usuario (staff).
- Admin/super_admin ven documentos y carpetas de **todos** los usuarios por defecto (antes solo veían lo propio).
- **Sesión endurecida (18/09/2026):** el logout llama a `POST /auth/logout` (revoca refresh + access si manda `Authorization`); el menú de usuario tiene “Cerrar todas las sesiones” (`POST /auth/logout-all`).

**✅ Seguridad de sesión (hardening 14/09, UI lista 18/09/2026):**

1. ~~El logout del frontend no llama al backend~~ — **ya construido**: `api/auth/logout` revoca el refresh (y el access si hay cookie) antes de borrar cookies.
2. ~~Sin UI para `logout-all` / `revoke-sessions`~~ — **ya construido**: botón en el menú de usuario y “Cerrar sesiones” en `/usuarios`.
3. ~~Sin UI de reseteo de contraseña~~ — **ya construido**: modal “Resetear clave” para `super_admin` en `/usuarios`.

**⏳ Pendiente — prioridad media:**

4. **Ajustar el botón de reprocesar** (agregado 11/09/2026 por Daniel) — hoy solo aparece para documentos `"completed"`, pero el backend permite reprocesar **cualquier documento que ya tenga un archivo original**, sin importar su estado. El caso más útil es justo un documento `"failed"` (por ejemplo, tras una caída del worker) — hoy esos documentos muestran el botón de "subir escaneo" en vez de "reprocesar", y si alguien lo usa, el backend responde `409` porque el documento ya tiene un archivo. Cambiar la condición del botón (`documentos/page.tsx`) para que también aparezca cuando `status === "failed"`.
5. **Mostrar el motivo del fallo** (`error_message`, ver sección 3) cuando un documento queda en `"failed"` — hoy el backend lo expone pero no se muestra en ningún lado.
6. **Sin papelera/restaurar** — el borrado ya es recuperable (`DELETE` hace soft-delete, `POST /documents/{id}/restore` lo recupera, `?include_deleted=true` los lista), pero no hay ninguna pantalla para verlos ni un botón de restaurar.
7. ~~Filtro por rango de meses en `/documentos`~~ — **ya construido** (17/09/2026): selector "mes archivado desde/hasta" usando `?archived_month_from=&archived_month_to=`.
8. **Decidir el destino de `/carpetas`** ahora que existe `/ubicacion` (la navegación real por estante/división/columna/tomo) — ¿conviven las dos pantallas, o se retira el árbol manual de carpetas? Es una decisión de producto, no un bug. **⚠️ En curso, sin coordinar (20/09/2026):** hay 4 ramas distintas resolviendo esto por separado — `fix/filtro_meses`, `fix/modal_subirDoc` (Alex), `frontend/unificar-archivo`, y el PR #72 "buscador de ubicaciones" (Daniel, incluye además el punto 9 de abajo). Ninguna coordinada con las otras. **No mergear ninguna** hasta que el equipo decida cuál se queda como la oficial.
9. **Buscador de texto dentro de `/carpetas`** — un input simple que filtre la lista ya cargada por nombre, sin pegarle de nuevo al backend. Ya resuelto (para `/ubicacion`) en el PR #72 mencionado arriba, pendiente de coordinar junto con el punto 8.
10. **Vista tabla/grilla intercambiable** en `/documentos` — un botón para alternar entre la tabla actual y una vista de tarjetas.

Ninguno de estos bloquea el uso básico del sistema.

## Pantalla de inicio (13/09/2026)

Ruta: `/inicio`. Es la primera opción del menú. Después del login —y si ya hay sesión en `/` o `/login`— se entra aquí, no a `/carpetas`.

Muestra:

- **Total:** `GET /documents?page=1&per_page=8`, usando el campo `total`.
- **Pendientes:** el mismo listado con `status_filter=pending` (solo se usa el total).
- **Completados:** `status_filter=completed`.
- **Actividad reciente:** los 8 documentos de la primera petición, ya ordenados por `created_at desc` (ubicación, período y estado).

Archivos: `frontend/src/app/(dashboard)/inicio/page.tsx`, link en `Sidebar.tsx`, redirección en `login/page.tsx` y `middleware.ts`.

Cómo probar: entrar con un usuario, confirmar que abre `/inicio`, que las tres tarjetas cargan y que "Ver todos" lleva a `/documentos`. Esto no unifica Carpetas y Ubicación; esa decisión sigue pendiente.

> ⚠️ Nota para quien construyó `DocumentEditModal`: detectamos y corregimos (07/09/2026) un bug del backend que afectaba directamente a este modal — `PATCH /documents/{id}` ignoraba en silencio cualquier campo enviado explícitamente como `null` (por ejemplo, para quitarle la carpeta a un documento, o borrar el mes final del período). Ya está corregido en `main`; si probaste "borrar carpeta" o "borrar período" antes del 07/09 y no funcionó, ya debería andar bien ahora.

## Ideas de diseño de referencia (31/08/2026)

Un compañero de curso armó un mockup visual del mismo tipo de sistema (React + Vite, 100% datos simulados en memoria, sin backend real — carpeta `pruebas/` en este repo, no confundir con nuestro frontend real). No es código para copiar (es otro framework, otro modelo de datos, y no habla con nuestra API), pero tiene ideas de UX que valen la pena portar a nuestras pantallas reales:

5. ~~Dashboard/inicio con resumen y "actividad reciente"~~ — **ya construido** como `/inicio` (13/09/2026): tarjetas de total, pendientes y completados, y los últimos documentos (`GET /documents` ordenado por `created_at desc`). El login redirige ahí.
6. ~~Mapa visual de estantes~~ — **ya construido** como la pantalla `/ubicacion` (10/09/2026), navega estante → división → columna → tomo con `GET /documents/locations`.
7. Buscador de categorías/carpetas por texto, y vista tabla/grilla intercambiable — ver la lista de pendientes al inicio de este documento.

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
Importante: cada llamada a `/refresh` invalida el `refresh_token` usado y entrega uno nuevo. Guarda siempre el par más reciente (access + refresh), no solo el access. Límite: 30 intentos cada 15 minutos por IP (`429` si se supera) — no debería afectar el uso normal.

**Cerrar sesión**
```
POST /auth/logout
{ "refresh_token": "..." }

→ 204
```
Revoca el `refresh_token` en el servidor (ya no sirve para `/refresh`, aunque no haya expirado). Si además se manda `Authorization: Bearer <access>`, también invalida ese access de inmediato. El frontend ya llama a este endpoint desde `api/auth/logout` **antes** de borrar las cookies locales (18/09/2026).

> ⚠️ **(nuevo, 14/09/2026) Ya no hace falta trabajar el trade-off de "el access_token sigue vivo tras el logout"**: si el request a `/auth/logout` incluye el header `Authorization: Bearer <access_token>` (el mismo que ya se manda en cualquier otro request autenticado), el backend además invalida ese access_token de inmediato — cualquier uso posterior responde `401`. Es **opcional**: si no se manda el header, el comportamiento es igual que antes (solo se revoca el refresh_token). Recomendación: que el logout del frontend mande el header, así el cierre de sesión es inmediato de verdad y no depende de esperar los ~15 minutos de vida del access_token.

**Cerrar todas las sesiones (nuevo, 14/09/2026)**
```
POST /auth/logout-all
→ 204 (requiere Authorization: Bearer <access_token>)
```
Cierra **todas** las sesiones activas del usuario autenticado de una sola vez (todos los refresh tokens + todos los access tokens ya emitidos, sin importar desde qué dispositivo/pestaña se hayan generado). Útil para un botón de "cerrar sesión en todos los dispositivos".

**Revocar sesiones de otro usuario (nuevo, 14/09/2026, solo admin/super_admin)**
```
POST /auth/users/{id}/revoke-sessions
→ 204
```
Mismo efecto que `logout-all` pero forzado por un admin/super_admin sobre un usuario que gestiona (ej. sospecha de cuenta comprometida). Respeta la misma regla de "quién gestiona a quién" que ya usa `PATCH /auth/users/{id}`.

**Usuario actual**
```
GET /auth/me
→ 200 { id, email, full_name, role, is_active }
```
`role` es uno de `student`, `admin`, `super_admin` — útil para decidir qué mostrar en la UI (ej. un estudiante no debería ver el botón de "ver documentos de otros").

**Gestionar usuarios existentes** (solo `admin`/`super_admin`):
```
GET   /auth/users?role_filter=&page=&per_page=            → 200 { items, total, page, pages }
GET   /auth/users/{id}                                     → 200 (404 si no esta en tu alcance)
PATCH /auth/users/{id}   { role?, is_active?, password? }   → 200
```
Un `admin` solo ve/gestiona `student`; un `super_admin` ve/gestiona `admin` y `student` (nadie ve otros `super_admin` por API). Desactivar a alguien (`is_active: false`) le bloquea el login inmediatamente (403) y también invalida cualquier sesión que ya tuviera abierta.

> 🔑 **(nuevo, 14/09/2026) Reseteo de contraseña**: `PATCH /auth/users/{id}` ahora acepta `password` (string, mínimo 8 caracteres) para fijarle una contraseña nueva a otro usuario. **Solo `super_admin`** puede mandar este campo — un `admin` normal que lo intente recibe `403`. No hay flujo de "olvidé mi contraseña" por email (decisión del equipo: no se quiere integrar un servicio de correo); es un reseteo manual — el super_admin fija la contraseña y se la comunica a la persona por otro medio. Al resetear, se cierran automáticamente todas las sesiones activas de esa persona (mismo mecanismo que `revoke-sessions`), así que tiene que volver a loguearse con la contraseña nueva.

**Crear usuario nuevo** (solo `admin`/`super_admin`):
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

### Propuesta de rediseño (nuevo, 07/09/2026): "carpetas" basadas en ubicación física

Las carpetas de arriba son un árbol **manual** (lo arma el usuario a mano) y hoy en producción **nadie las usa de verdad** — no reflejan la ubicación física real del archivo (estante/división/columna/tomo), que ya tiene cada documento. Discutimos con el equipo la idea de que la navegación de "carpetas" en realidad sea el **gabinete físico real** (estante → división → columna → tomo), en vez de un árbol arbitrario.

Se agregó un endpoint nuevo para esto, **sin tocar ni reemplazar** el módulo de `folders` de arriba (para no romper lo que ya está construido) — la decisión de si `/carpetas` en la UI pasa a usar esto en vez de (o adicionalmente a) las carpetas manuales queda del lado del frontend:

```
GET /documents/locations?physical_shelf=&physical_division=&physical_column=
→ 200 [{ value, document_count }, ...]
```

Sin parámetros, devuelve los **estantes** distintos que existen (con cuántos documentos tiene cada uno). Pasando `?physical_shelf=E-01` devuelve las **divisiones** dentro de ese estante. Pasando `?physical_shelf=E-01&physical_division=D-02` devuelve las **columnas**, y agregando `physical_column` devuelve los **tomos**. Es decir, se usa como un drill-down: en cada nivel, pasás todos los filtros de los niveles ya elegidos, y te devuelve los valores distintos del siguiente nivel.

Documentos sin ese campo cargado no aparecen en el árbol (no tienen ubicación física). Respeta las mismas reglas de visibilidad que `GET /documents` (staff ve todo, el resto solo lo propio o lo asignado). Una vez que el usuario llega al último nivel (tomo), se puede usar `GET /documents?physical_shelf=&physical_division=&physical_column=` para listar los documentos de esa combinación exacta.

## 3. Documentos

Ya funciona el flujo completo: subir el archivo, procesarlo (OCR + restauración de imagen + PDF/A) y descargarlo. Cuando subes un archivo, el documento pasa automáticamente por `pending` → `processing` → `completed` (unos segundos, según el tamaño). Puedes hacer polling sobre `/documents/{id}/status` para saber cuándo terminó.

Formatos aceptados: `png, jpg, jpeg, tiff, bmp, pdf`. Tamaño máximo: 20 MB. Límite de subidas: 20 por hora por usuario (`429` si se supera, tanto en `/documents/upload` como en `/documents/{id}/upload`) — pensado para el uso normal del personal del archivo, no debería afectar a nadie salvo un caso de abuso.

✅ Si el archivo es un PDF de varias páginas, se procesan **todas** — el PDF/A generado y el texto extraído cubren el documento completo, no solo la primera página.

> ⚠️ Para el equipo de frontend: `documentos/page.tsx:213` todavía dice "Si el PDF tiene varias páginas, solo se procesa la primera." — ese mensaje ya quedó desactualizado (26/08/2026) y debería quitarse o corregirse.

Hay **tres formas** de crear/completar un documento, según el flujo de tu UI:

**A. Todo en un solo paso** (cuando ya tienes el archivo listo, ej. una foto recién tomada):
```
POST /documents/upload
multipart: file=<archivo>, title="...", doc_type? , folder_id?

→ 202 { document_id, task_id: null, status: "pending" }
```

**B. Registrar primero, escanear/subir después** (ej. el staff arma la lista de documentos pendientes de digitalizar, y va subiendo cada escaneo conforme lo procesa) — **ya construido** en `/documentos` (botón "Subir escaneo" para documentos sin archivo):
```
1) POST /documents          { title, description?, doc_type?, folder_id?, physical_shelf?, physical_division?, physical_column?, physical_volume?, archived_year?, archived_month_start?, archived_month_end? }   → 201, documento sin archivo
2) POST /documents/{id}/upload   multipart: file=<archivo>                    → 202 { document_id, status }
```
Intentar subir un segundo archivo al mismo documento responde `409` (un documento solo tiene un archivo original).

Los **289 documentos reales** migrados desde el sistema anterior del archivo físico ya están en este estado (creados sin archivo) — el botón de "subir escaneo" del listado de `/documentos` ya cubre este caso.

Los campos `physical_*` (`physical_shelf`, `physical_division`, `physical_column`, `physical_volume`, todos `string`) son opcionales y catalogan dónde está guardado físicamente el documento (estante/división/columna/tomo).

Los campos `archived_year` (`int`), `archived_month_start`/`archived_month_end` (`int`, 1-12, `month_end` opcional si es un único mes) son opcionales y catalogan **el período que cubre el contenido archivado** — distinto de `created_at`, que es cuándo se subió el registro al sistema. Ej: un tomo con actas de "Enero a Abril 2023" se guarda como `archived_year: 2023, archived_month_start: 1, archived_month_end: 4`.

Todos estos campos (`physical_*` y `archived_*`) se pueden pasar en la creación o agregar/corregir después con `PATCH /documents/{id}`.

**Resto de endpoints:**
```
GET    /documents?page=&per_page=&folder_id=&status_filter=&doc_type=&physical_shelf=&physical_division=&physical_column=&physical_volume=&archived_year=&archived_month_from=&archived_month_to=&owner_id=&assigned_to_id=&include_deleted=  → 200 { items, total, page, pages }
GET    /documents/{id}                                                  → 200 (incluye original_image/generated_pdf/extracted_text si existen)
GET    /documents/{id}/status                                           → 200 { status, processed_at, error_message }
GET    /documents/{id}/download                                        → 200, archivo (PDF procesado, o el original si aun no termino)
POST   /documents/{id}/reprocess                                        → 202 { document_id, task_id, status: "reprocessing" }
PATCH  /documents/{id}      { title?, description?, doc_type?, folder_id?, assigned_to_id? }  → 200
DELETE /documents/{id}                                                  → 204 (soft-delete, ver nota abajo)
POST   /documents/{id}/restore                                          → 200, recupera un documento borrado
```

Estados posibles de `status`: `pending` → `processing` → `completed` (o `failed`). Sugerencia: después de subir, hacer polling a `/documents/{id}/status` cada 1-2 segundos hasta que sea `completed`, y ahí mostrar el botón de descarga / el texto extraído.

> ⚙️ **(nuevo, 14/09/2026) Reintentos automáticos**: si el procesamiento falla por algo transitorio (ej. una caída momentánea de almacenamiento), el backend reintenta solo hasta 3 veces con backoff (30s/60s/120s) antes de marcar `failed`. Mientras tanto el documento se queda en `status: "processing"` — el polling que ya tenían sigue funcionando igual, solo puede tardar un poco más en algunos casos raros antes de llegar a `completed` o `failed`. No hace falta cambiar nada en el frontend por esto.
>
> ⏱️ **(nuevo, 16/09/2026) Procesamiento acotado en el tiempo**: antes, un archivo problemático podía dejar un documento colgado en `status: "processing"` indefinidamente (llegó a pasar por horas). Ahora el worker corta la tarea sola a los 10-11 minutos y, si por algún motivo queda "huérfana" igual, una revisión automática cada 5 minutos la vuelve a encolar. En la práctica, un documento nunca debería quedarse en `processing` por más de ~20-25 minutos — si el frontend quiere mostrar algún aviso tipo "esto está tardando más de lo normal", ese es el umbral de referencia.
>
> 📋 **(nuevo, 14/09/2026) Motivo del fallo visible**: `GET /documents/{id}/status` y el detalle del documento (`GET /documents/{id}`) ahora traen `error_message` (string o `null`). Antes, cuando un documento quedaba en `failed`, no había forma de saber por qué desde el frontend — ahora se puede mostrar el motivo (ej. "El documento no tiene un archivo original asociado") en vez de un genérico "algo salió mal".
>
> 🗑️ **(nuevo, 14/09/2026) Borrar documentos ya no es irreversible**: `DELETE /documents/{id}` pasó a ser un soft-delete — el documento y sus archivos en MinIO se conservan, solo se marca `deleted_at` y deja de aparecer en listados/búsqueda/detalle. `POST /documents/{id}/restore` lo recupera (responde el documento actualizado, con `deleted_at: null`). Si quieren armar una vista de "papelera", `GET /documents?include_deleted=true` la trae (solo tiene efecto para `admin`/`super_admin`; un `student` que lo pase se ignora silenciosamente y ve lo de siempre).

**Filtro por rango de meses (nuevo, 07/09/2026):** `?archived_month_from=` y `?archived_month_to=` (ambos 1-12, ambos opcionales, se pueden usar solo, o los dos juntos). Filtra por el período archivado del documento (`archived_month_start`/`archived_month_end`), sin importar el año — combínalo con `?archived_year=` si además querés acotar a un año puntual. Ej: `?archived_month_from=3&archived_month_to=7` trae los documentos cuyo período se solapa con marzo-julio (de cualquier año). Los documentos sin `archived_month_start` (sin período cargado) quedan afuera de este filtro.

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

Pendientes conocidos del backend (no bloquean el desarrollo del frontend):
- `POST /auth/logout` revoca el refresh token y, si se manda el header `Authorization`, también el access token — el frontend ya lo llama desde `api/auth/logout` (18/09/2026).
- Rate limiting: ya cubre login (5/15min), `/auth/refresh` (30/15min por IP), subidas de documentos y reprocesar (20/hora por usuario cada uno), creación/edición de usuarios (30/hora), creación de folders (30/hora) y búsqueda (60 cada 5 min por usuario). **(actualizado 14/09/2026)** — antes solo cubría login/refresh/uploads.

## 6. Errores comunes a manejar en el frontend

| Código | Cuándo pasa |
|---|---|
| 401 | Token vencido/inválido, **o revocado** (logout, logout-all, revoke-sessions o reseteo de contraseña) → intentar refresh, si falla ir a login |
| 403 | El usuario no tiene permiso para esa acción (ej. `student` intentando crear un usuario, o `admin` intentando resetear una contraseña) |
| 404 | El recurso no existe, no te pertenece, o está borrado (soft-delete) — no se distingue, por seguridad |
| 413 | Archivo declarado en `Content-Length` demasiado grande, se rechaza antes de subirlo entero |
| 422 | Body inválido (faltó un campo, formato incorrecto) — el detalle viene en `detail` |
| 429 | Rate limit — ver la lista completa en la sección 5. El mensaje viene en `detail` |
