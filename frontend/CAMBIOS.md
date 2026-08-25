# Cambios de esta rama (`frontend/arreglo-proxy`)

Esto es lo que toqué en el frontend. El backend no se modificó.

## Problema

El login funcionaba, pero en Vercel se quedaba en "Cargando..." el usuario y las carpetas.

En Swagger, `GET /auth/me` sí devolvía `full_name` y `role`. En el Network del navegador, `/api/proxy/folders` salía 200 pero el body venía vacío o cortado (`content-length: 6`).

La causa estaba en el proxy de Next (`frontend/src/app/api/proxy/[...path]/route.ts`). Se reenviaba la cabecera `content-length` del backend tal cual. En producción (Render + Vercel, a veces con `br`) ese tamaño no coincidía con el body que se mandaba al navegador, y el JSON se cortaba. Por eso `/me` no pintaba el nombre y las carpetas no cargaban.

## Qué cambié

### Proxy
En el arreglo de cabeceras que se copian al response quité `"content-length"`. Ahora solo se pasan:

- `content-type`
- `content-disposition` (para las descargas)

Vercel calcula el tamaño solo. El JSON de `/me`, carpetas, documentos, etc. llega completo.

### Usuario (nombre y rol)
Se muestran el nombre y el rol en:

- la barra de arriba (a la derecha)
- el menú de la izquierda, arriba de Cerrar sesión
- el menú desplegable (nombre, rol y email)

Los datos salen de `GET /auth/me`, igual que antes. Lo que fallaba era que esa respuesta se cortaba.

### Carpetas
- Adentro de una carpeta se puede subir un documento (`folder_id` en el upload).
- Se listan los documentos de esa carpeta.
- Descargar solo si el estado es `completed`.

### Documentos
La tabla quedó en título, estado y descarga (cuando ya terminó el OCR). Saqué tipo y ubicación física porque en el form de subida no se mandaban.

### Layout
El dashboard ya no tapa toda la pantalla con "Cargando sesión...". Se ve el menú mientras llega `/me`.

## Archivos

- `frontend/src/app/api/proxy/[...path]/route.ts`
- `frontend/src/components/layouts/TopBar.tsx`
- `frontend/src/components/layouts/Sidebar.tsx`
- `frontend/src/app/(dashboard)/layout.tsx`
- `frontend/src/app/(dashboard)/carpetas/page.tsx`
- `frontend/src/app/(dashboard)/documentos/page.tsx`
- `frontend/src/app/(dashboard)/usuarios/page.tsx`

## Cómo probar

1. Esperar a que Vercel tome esta rama (o probar local con `API_URL` al backend).
2. Recargar fuerte (Ctrl+F5).
3. Entrar: arriba debería verse el nombre y el rol, no "Cargando...".
4. Carpetas debería listar o mostrar vacío de verdad, no quedarse cargando.
5. Si Render estaba dormido, la primera petición puede tardar un rato. Eso es del plan free, no del proxy.
