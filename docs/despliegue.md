# Ejecución local, programación y despliegue

Este documento cubre tres frentes: dónde corre la actualización de datos, qué permisos necesita y cómo se publica el dashboard estático en GitHub Pages. No hay servicios pagos contratados.

## 1. Estado actual

| Componente | Estado |
|---|---|
| Ingesta API INDEC (`npm run data:refresh`) | Activa y verificada en este equipo (corrida manual) |
| Google Sheets (`npm run sheets:sync`) | Activo y verificado: 4 documentos creados en Mi unidad del usuario |
| Dashboard | **Publicado** como sitio estático en GitHub Pages: https://imarinione618.github.io/monitor-macro/ |
| Tarea diaria en Windows (`scripts/schedule-windows.ps1`) | **Activa y verificada**: diaria a las 12:00. Hace ingesta, Sheets y push de `data/store` |
| GitHub Actions (`deploy/github-actions/update.yml`) | **Plantilla lista para activar**: requiere un repositorio privado y secrets |
| Workflow de Pages (`.github/workflows/pages.yml`) | Activo: en cada push de datos o código corre pruebas, build y deploy |

## 2. Ejecución local

```bash
npm ci
npm run data:refresh
npm run sheets:sync
npm run build
npm start        # sirve el sitio estático de out/ en http://localhost:3000 (--port 8080 para otro puerto)
```

El dashboard es un **sitio estático**: `npm run build` genera `out/` con los datos de `data/store` de ese momento. Después de un `data:refresh`, hay que volver a correr `npm run build` para verlos localmente. En `npm run dev` los datos se leen en cada recarga.

**Ubicación:** el proyecto está en una carpeta local fuera de OneDrive, porque la sincronización interfería con `node_modules`, la caché y el lock.

## 3. Actualización programada

### Opción A: Programador de tareas de Windows (este equipo)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/schedule-windows.ps1 -Time 08:30   # registrar/actualizar
powershell -ExecutionPolicy Bypass -File scripts/schedule-windows.ps1 -Status       # ver estado
powershell -ExecutionPolicy Bypass -File scripts/schedule-windows.ps1 -Unregister   # quitar
```

- La tarea corre `scripts/update.ps1`: primero `data:refresh`, después `sheets:sync`. Deja el log en `data/runs/update-AAAA-MM-DD.log`.
- **Permisos:** solo los del usuario actual. Usa el `.env` y el refresh token de `.secrets/`. No necesita permisos de administrador.
- **Limitación:** solo corre con el equipo encendido. Si estaba apagado a la hora pactada, corre al encenderlo (`StartWhenAvailable`).
- La hora es la del equipo; el script advierte si la zona horaria no es la de Buenos Aires.
- Es idempotente: registrarla dos veces reemplaza la misma tarea. Si ya hay una corrida en curso, una nueva instancia no arranca, y además el lock de la ingesta impide corridas simultáneas.

### Opción B: GitHub Actions (funciona con el equipo apagado)

1. Crear un repositorio **privado** en GitHub y subir el proyecto. `.env`, `.secrets/` y `config/sheets.local.json` están excluidos por `.gitignore`.
2. Copiar `deploy/github-actions/update.yml` a `.github/workflows/update.yml`.
3. Cargar los secrets del repositorio:
   - `INDEC_API_TOKEN`
   - `GOOGLE_AUTH_MODE=oauth`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_TOKEN_JSON`: el contenido de `.secrets/google-oauth-token.json`
   - `SHEETS_ID_*`: los IDs de `config/sheets.local.json`
4. Correr una vez manualmente: *Actions → Actualizacion diaria → Run workflow*.

Detalles de funcionamiento:
- **Horario:** cron `30 11 * * *` en UTC, que equivale a 08:30 en Buenos Aires (UTC−3, sin horario de verano).
- **Persistencia:** el store se versiona en el propio repositorio, con un commit por corrida cuando hay cambios. El disco del runner es efímero y no se usa como almacenamiento.
- **Costo:** los repositorios privados tienen 2.000 minutos mensuales gratis en el plan Free. Una corrida diaria por ventana tarda unos pocos minutos, y la reconciliación mensual de comercio exterior, unos 6.
- **Riesgo:** el refresh token de OAuth queda guardado como secret del repositorio. Alternativa: cuenta de servicio con los documentos compartidos (ver `docs/google-sheets.md`).

## 4. Dashboard publicado (GitHub Pages)

- **Sitio:** https://imarinione618.github.io/monitor-macro/. Repositorio público `imarinione618/monitor-macro`; decisión del usuario del 2026-11-04.
- **Flujo diario:**
  1. La tarea local (12:00) corre `scripts/update.ps1`: ingesta, Sheets, y `git commit` + `git push` de `data/store`.
  2. Ese push dispara `.github/workflows/pages.yml`: `npm ci`, pruebas, build con `SITE_BASE_PATH` = subruta del repositorio, escaneo de secretos y deploy.
- **Secretos:** GitHub no recibe ninguno. El token del INDEC y las credenciales de Google quedan solo en este equipo (`.env`, `.secrets/`, gitignored).
- **Qué se publica:** el código, la documentación y los datos normalizados (públicos, del INDEC). Los IDs de los Google Sheets no se publican (`config/sheets.local.json` es local).
- **Equipo apagado:** si a las 12:00 la computadora estaba apagada, la tarea corre al encenderla y el sitio se actualiza en ese momento.
- **Despublicar:** *Settings → Pages → Unpublish*, o pasar el repositorio a privado (en el plan gratuito, Pages se desactiva).
