# Precios de combustibles

Módulo `src/combustibles/` → store `data/combustibles/`. Independiente del store INDEC (`data/store`) y del monetario (`data/monetary`).

## Fuentes

Secretaría de Energía, portal CKAN `datos.energia.gob.ar` (licencia CC-BY-4.0). Sin credenciales.

| Fuente | Recurso | Tamaño | Actualización | Uso |
|---|---|---|---|---|
| Res. 314/2016 — precios en surtidor | [Precios vigentes](http://datos.energia.gob.ar/dataset/precios-en-surtidor) (`80ac25de…`) | ~9 MB, ~36.600 filas | ~cada hora | foto del último precio declarado por estación/producto/horario |
| Res. 314/2016 | Precios históricos (`f8dda0d5…`) | ~780 MB, 3,38 M filas | 1 vez por día | registro de cada cambio de precio |
| Res. 1104/04 — precios y volúmenes EESS | [Precios EESS desde Diciembre 2024](http://datos.energia.gob.ar/dataset/precios-eess---resolucion-1104-04) (`3cbdd364…`) | ~134 MB | mensual, ~1 mes de rezago | declaración jurada mensual por estación (incluye YPF) |
| Res. 1104/04 | Precios EESS 2016 … 2024 (URLs tomadas de `package_show`) | ~60 MB c/u | estáticos | historia mensual |

Formatos verificados (nov-2026):

- Vigentes: `fecha_vigencia` = `2026-11-02 13:23:00`; columnas `indice_tiempo, idempresa, cuit, empresa, …, provincia, region, idproducto, producto, idtipohorario, tipohorario, precio, fecha_vigencia, …`.
- Histórico: `fecha_vigencia` = `01/04/2024 10:11` (dd/mm/aaaa hh:mm); sin `cuit/region/indice_tiempo`, con `anio, mes`. **No está ordenado por fecha.** El servidor ignora `Range`: se procesa en streaming, sin guardar el archivo.
- Productos Res. 314 (`idproducto` → `producto`, se valida el nombre exacto en cada lectura): `2` Nafta (súper) entre 92 y 95 Ron · `3` Nafta (premium) de más de 95 Ron · `19` Gas Oil Grado 2 · `21` Gas Oil Grado 3 (`6` GNC se ignora). Horario `2` Diurno.
- Res. 1104: el archivo vigente trae `periodo` (`2026/09`) y `no_movimientos`; los anuales traen `anio`, `mes` y `no_novimientos` (sic). Valores exactos de `producto` usados: `Nafta (súper) entre 92 y 95 Ron`, `Nafta (premium) de más de 95 Ron`, `Gas Oil Grado 2`, `Gas Oil Grado 3`. Se ignoran `GNC`, `Gas Oil Grado 2B` (solo 2016–2019), `Nafta (común) hasta 92 Ron`, `Kerosene`, `GLPA`, `N/D`. Canal: `Al público` (se ignoran Agro, Transporte de cargas, Reventa, etc.).
- CABA = `provincia` `CAPITAL FEDERAL` en ambas resoluciones.

## Series (IDs estables)

| ID | Frecuencia | Fuente |
|---|---|---|
| `combustibles.surtidor.<producto>.<ámbito>` | diaria (`YYYY-MM-DD`), desde 2018-01-01 | Res. 314 |
| `combustibles.eess.<producto>.<ámbito>` | mensual (`YYYY-MM`), desde 2016-01 | Res. 1104 |

`<producto>` ∈ `super`, `premium`, `gasoil_g2`, `gasoil_g3`; `<ámbito>` ∈ `nacional`, `caba`. Unidad: ARS por litro, precio final al público (con impuestos), nominal. Contrato: `FuelSeries` en `src/combustibles/types.ts` (`def`, `observations[{date, value, n}]`, `retrievedAt`, `stale`, `error?`). Definiciones sin dependencias de Node en `src/combustibles/defs.ts`; lectura para el dashboard: `readFuelStore()` en `src/combustibles/store.ts` (solo servidor/build).

## Metodología

### Diaria — mediana de precios en surtidor (Res. 314)

1. **Eventos**: cada fila diurna de los cuatro productos es un evento (estación `idempresa`, producto, `fecha_vigencia`, precio). Se unen histórico y vigentes; ante la misma estación/producto/minuto, la foto de vigentes (más reciente) prevalece. Dos precios distintos para el mismo minuto dentro de una misma fuente son ambiguos y se descartan (1 caso en el histórico: 04/02/2022, 107,50 vs 185,10).
2. **Fechas basura**: se descartan fechas ilegibles, anteriores a 2016-01-01 o posteriores a hoy (hora Argentina). En el histórico actual son 144 filas (años 0001–0207, 1157, 1218, 1572, 1779, 2001–2015, 2027–2044, 3201, 4201, 6202–9920).
3. **Precio vigente al día d**: por estación, el último evento con vigencia ≤ 23:59 de d (hora local tal como se publica). Es el precio declarado vigente, no una interpolación.
4. **Exclusiones**: la estación sale de la muestra si ese evento tiene más de **90 días** (d − fecha del evento > 90), si el precio es ≤ 0 (no se vuelve al precio anterior) o si cae fuera de **±50% de la mediana nacional del día para el producto** (la misma referencia nacional se usa para filtrar la muestra de CABA).
5. **Estadístico**: mediana (con n par, promedio de los dos centrales) y `n` = estaciones usadas. Con menos de 3 estaciones el valor es `null` (nunca 0).
6. **Último día**: el día anterior al evento publicado más reciente, y nunca hoy. El publicador carga con días de atraso (hoy, 06/11, el histórico llega al 02/11 y vigentes al 03/11 06:50) y el último día con eventos suele estar incompleto, por lo que no se calcula; tampoco se inventan días posteriores. Cada corrida recalcula los últimos 35 días: si llegan cambios tardíos con fecha de vigencia anterior, el valor del día se corrige y queda registrado en `revisions.jsonl`.

Quiebres y limitaciones:

- **YPF (jul-2025)** — `breaks: [{ date: '2025-07-01', … }]` en las 8 series diarias. Desde julio de 2025 YPF casi no informa: la muestra nacional pasa de ~3.700 estaciones a ~1.800 en octubre de 2025 y ~750–800 en nov-2026 (CABA: de ~170 a ~55–60). Por la regla de 90 días la caída es **gradual entre julio y octubre de 2025**, a medida que vencen los últimos precios de YPF. El nivel posterior sube por composición (YPF suele ser más barata): no comparar niveles a través del quiebre sin cuidado; para niveles usar la serie mensual 1104, que sí incluye YPF.
- **Congelamientos de precios** (regla de 90 días): cuando no hubo cambios de precios por más de 90 días, las estaciones no vuelven a declarar y salen de la muestra aunque su precio siga vigente. Afecta jun–ago 2020 (n nacional mínimo ≈ 260 para súper) y ago-2021 a feb-2022 (mínimo ≈ 500). En CABA hay días `null` (n < 3) en esos tramos: súper 7 días (jun-2020), premium 17, gasoil G2 98 (abr–ago 2020) y gasoil G3 120 (jun-2020 a feb-2022). La mediana de esos días es representativa de pocas estaciones; mirar `n`.
- Precios en pesos corrientes; ventas/precios nominales no son volumen ni precio real.

### Mensual — precio promedio ponderado por volumen (Res. 1104)

Para cada mes y producto, sobre los registros del canal `Al público`:

- Se excluyen registros marcados sin movimiento (`no_movimientos` ≠ `NO`), con **volumen 0, negativo o faltante** (no se pueden ponderar; en la práctica el canal al público no trae volúmenes 0), con precio de surtidor ≤ 0 o faltante.
- **Outliers de precio**: fuera de ±50% de la mediana nacional del mes/producto (hay precios cargados como 0,01 o 1, y otros de 13.321 o 555.555 en 2016).
- **Outliers de volumen**: volumen mayor a **50 veces la mediana nacional** del mes/producto. Son errores de unidad (litros declarados como m³, ×1000): p. ej. en mar-2023 una estación de CABA declara 117.179 de gasoil G2 contra una mediana de 58, y en mar-2016 una declara 54,5 millones de premium. Sin este filtro dominan la ponderación (premium nacional mar-2016 daba 550.855 $/l; gasoil G2 CABA mar-2023, +38%). La distribución de cocientes volumen/mediana es bimodal con un valle entre 30× y 50×.
- Valor = Σ(precio × volumen) / Σ volumen, sin redondear. `n` = registros usados. Con menos de 3 registros, `null`.
- Ámbito CABA = registros con provincia `CAPITAL FEDERAL` (la referencia de outliers es nacional).
- El archivo vigente se superpone con el anual 2024 en 2024/12 (con distinto número de registros): prevalece el vigente. Entre anuales, prevalece el más nuevo.
- El último mes publicado suele estar incompleto (sep-2026: ~3.700 registros vs ~4.000 habituales) y se revisa en descargas siguientes (queda en `revisions.jsonl`).

## Actualización

```
node node_modules/tsx/dist/cli.mjs src/combustibles/cli.ts            # corrida normal
node node_modules/tsx/dist/cli.mjs src/combustibles/cli.ts --full     # reconstrucción completa
node node_modules/tsx/dist/cli.mjs src/combustibles/cli.ts --solo=surtidor   # o --solo=eess
```

(Sin script en `package.json` todavía; sugerido: `"combustibles:refresh": "tsx src/combustibles/cli.ts"`.) API: `refreshCombustibles({ full, only, dir, now, log, fetch, readLines, retries })`.

- **Surtidor, carga inicial / reconciliación** (sin estado, `--full`, o cada 7 días): histórico completo en streaming (~780 MB, ~20–40 s de proceso) + vigentes; se recalcula toda la serie desde 2018 y cualquier diferencia con lo guardado queda como revisión. Si el histórico falla y existe estado, se hace la corrida diaria y la reconciliación se reintenta en la próxima corrida (`manifest.surtidor.error`).
- **Surtidor, corrida diaria**: estado persistido (`state/surtidor.json`) + vigentes (~9 MB). El estado guarda, por estación/producto, los eventos de los últimos 180 días más el último anterior (lo necesario para saber qué precio regía al inicio de la ventana y aplicar la regla de 90 días), y el conjunto de estaciones de CABA (~600 KB). Se recalculan los últimos 35 días. Limitación: vigentes solo muestra el último precio de cada estación; si una estación cambió dos veces entre corridas, el cambio intermedio recién aparece en la reconciliación semanal (en una prueba con 6 días de corridas solo-vigentes, 3 de 96 valores diferían en 1 $/l y se corrigen como revisión).
- **EESS**: el archivo vigente se descarga como mucho cada 7 días (o con `--full`); los anuales solo en la carga inicial o con `--full`. Los meses anteriores al vigente se conservan.
- **Validaciones**: esquema de columnas y nombres de producto/horario; filas mal formadas > 1% → error; cada serie debe tener valores y no puede perder más del 20% de las observaciones no nulas. Un bloque (surtidor o EESS) se escribe completo o no se escribe: ante falla se conserva la última versión válida con `stale: true` y `error`.
- Lock en `data/combustibles/.lock`; escrituras atómicas (`writeJsonAtomic`). Reintentos: 2 por descarga.

## Store

```
data/combustibles/
  manifest.json            última corrida, estado por fuente (lastHistoricoAt, lastVigentesAt, lastEventAt, lastDay, lastVigenteAt, lastAnnualAt, lastPeriod) y por serie
  series/<id>.json         16 series (~210 KB cada diaria, ~11 KB cada mensual)
  revisions.jsonl          revisiones (append-only)
  state/surtidor.json      estado mínimo para la corrida diaria (~600 KB)
```

Total ≈ 2,4 MB.
