# Validación de Monetario — 4 de noviembre de 2026

## Resultado

Se integran tres pestañas en la aplicación existente y tarjetas en Resumen. El catálogo operativo contiene84 series BCRA y439.907 observaciones históricas reales. El IPC nacional proviene del store INDEC existente. La ingesta está separada de Sheets y mantiene los últimos datos válidos ante fallas.

## Contraste de fuentes

Se consultaron la [API oficial BCRA v4](https://api.bcra.gob.ar/estadisticas/v4.0/monetarias?limit=3000), su documentación, metodologías por ID, el [monitor de referencia](https://imarinione618.github.io/monitor-bcra/), su código público y cinco pestañas del libro (CSV y fórmulas del XLSX), sin modificar ninguno. Los detalles y enlaces reproducibles están en [referencias](monetario-referencias.md) y [catálogo](monetario-catalogo.md).

| Vista | Muestra oficial | Resultado |
|---|---|---|
| Tasas | TAMAR44,02/11/2026 |23,9375% TNA; dashboard23,94 por redondeo visual |
| Tasas | BADLAR7,02/11/2026 |22,3125% TNA; dashboard22,31 |
| Remu |1196,20/09/2022 |57,64 coincide con Tasas!H5; H3 confirma ID1196 |
| Préstamos privados ARS | Promedio mayo2026,19 observaciones |96.596,76694736843 miles de millones; referencia96.596,76695 |
| Comerciales |110+111+116, promedio mayo2026 |38.992,56615789474 miles de millones; referencia38.992,56616 |
| Consumo |114+115, promedio mayo2026 |43.967,255526315785 miles de millones; referencia43.967,25553 |
| Garantía real |112+113, promedio mayo2026 |13.636,945263157895 miles de millones; referencia7.533,271526 porque omite prendarios6.103,673736842105 |
| Depósitos privados ARS |100,29/10/2026 |126.797.637 millones |
| Préstamos privados ARS |117,29/10/2026 |109.928.069 millones |
| Base + instrumentos v1 |1248+1258+1260+1262,30/10/2026 |47.321.620+243.895+0+0 =47.565.515 millones ARS |

La referencia usa medias de observaciones publicadas para los préstamos del ejemplo. El agregado contable propio no tiene un equivalente exacto en la planilla: se contrasta contra sus cuatro componentes oficiales, sin forzar una coincidencia con otra definición. La auditoría del libro confirmó que el bloque rotulado «Agregados públicos» contiene totales.

## Pruebas automatizadas e interacción

Resultado global: **660 pruebas aprobadas en27 archivos**, build de producción y TypeScript sin errores.

- Pruebas de ingesta: contrato v4, escala, fechas inválidas, duplicados, truncamiento, revisiones/retiradas, error de fuente, conservación de datos y exclusiones de instrumentos.
- Pruebas económicas: promedios/cierres, calendario común, faltantes/cero, períodos por calendario, parciales, deflactación, invariancia de variaciones al cambiar base, restricción USD/diario, puntos porcentuales/básicos, ratios comparables, agrupaciones y agregado sin imputación de ceros.
- Pruebas de presentación: mismo modelo para gráfico/tabla/CSV, precisión, fechas individuales, marcas parciales, composición por calendario común, SVG1600×900 con fondo blanco y leyenda sin ocultar series a espaldas del CSV.
- Revisión integrada en navegador local: tres pestañas, gráficos renderizados, selección real y tabla. Octubre2026 figura sin valor real al faltar IPC; septiembre2026 es la base vigente. La composición y total de instrumentos muestran datos contemporáneos sobre fechas comunes.
- Exportación PNG ejecutada en navegador:4800×2700, título, unidad, promedio mensual, rango y fuente; inspección visual del gráfico exportado satisfactoria. SVG se verifica por render real en pruebas. El navegador integrado no emitió un evento nativo de descarga en la automatización; se verificó el PNG generado mediante la URL de descarga y sus dimensiones.
- TypeScript, build estático bajo `/monitor-macro` y escaneo de secretos comprobados. Los tests de las secciones previas y Sheets usan simulaciones/fixtures; no se hicieron escrituras a Google Sheets.

## Correcciones de la auditoría final

La composición pública ARS no puede sumar1457+1461+1231: al07/05/2026 da33.911.434millones frente al total1229 de27.011.173. Se usa vista1230+plazo1231+residuo(1229−1230−1231), de definición compatible. El test reproduce esa discrepancia.

En USD público,107−108 da2.978millones al29/10/2026 y1495+1499+1501 suma2.843. Se conservan aperturas individuales; composición pública USD pendiente de auditar las modalidades del residuo135millones. Nunca se lo fuerza a cero.

## Limitaciones y pendientes

- Caución: faltan mercado, plazo y proveedor verificables en la referencia; no se publica como una serie BCRA.
- Mensuales992/893: metadata «miles ARS» incompatible con valores de la muestra; excluidas hasta aclaración. Los cierres se calculan de diarios.1494 público USD también excluida por conflicto moneda/unidad; se deriva107−108.
- Agregados privados M1/M3 propios desde2005; cuasimonedas2003/04 no incorporadas. Series oficiales históricas mantienen su fin de vigencia y sus notas.
- No se crea ratio público/total cuando las coberturas de préstamos y depósitos difieren. Las aperturas se pueden consultar individualmente.
- No se certifica un calendario de feriados ni cobertura diaria completa. Las reglas de parcialidad, conteo y cortes están en [metodología](monetario-metodologia.md).
- La integración de actualización diaria está implementada en el script Windows y en `npm run update`; no se disparó la tarea completa durante este trabajo porque incluye la sincronización Sheets previa. Se probaron la ingesta BCRA real, sus fallas/revisiones simuladas y la sintaxis de los scripts. La próxima corrida programada será la primera prueba del recorrido completo ampliado.
