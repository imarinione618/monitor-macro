# Metodología monetaria

## Fuentes y separación de responsabilidades

La API BCRA de estadísticas monetarias v4 alimenta `data/monetary`. INDEC continúa en `data/store`; se reutiliza el nivel del IPC nacional `precios.ipc.ng.nacional`. El navegador lee los datos publicados con el sitio estático. La planilla y el monitor de referencia se consultaron únicamente para auditar definiciones. No son dependencias de producción y no se sincroniza ninguna serie monetaria a Google Sheets.

El catálogo identifica unidades originales, factor de escala, moneda, sector, cobertura, frecuencia, tipo, convención y metodología por ID. Todos los stocks se almacenan en millones de su moneda; no se redondean antes de calcular. Ver [catálogo y correspondencias](monetario-catalogo.md) y [auditoría de referencias](monetario-referencias.md).

## Frecuencia, fechas y cobertura

- Diaria: observaciones publicadas, sin interpolación ni extensión a fines de semana.
- Promedio mensual: media aritmética de observaciones publicadas válidas. No se suman saldos para construir stocks mensuales. No se supone que represente un promedio de días calendario.
- Cierre mensual: última observación válida, con fecha efectiva visible. Una serie mensual oficial de cierre se prefiere cuando existe, su escala está verificada y la convención coincide; nunca se usa como promedio.
- Las sumas y composiciones se alinean por fecha antes de calcular promedios o cierres. Un componente ausente genera `null`, no cero. Se publica el número de observaciones simultáneas utilizadas.
- El mes corriente se marca parcial. También se marca cobertura parcial cuando existen faltantes explícitos o, conservadoramente, el último mes disponible no llega al último día lunes-viernes del mes. No se certifica un calendario de feriados; un feriado de fin de mes puede dejar esta advertencia hasta que haya un mes posterior. Las variaciones excluyen períodos marcados parciales.
- El conteo de observaciones no es una certificación de cobertura diaria completa. Huecos no informados por la fuente no se rellenan. Una revisión posterior del BCRA puede cambiar promedios históricos.
- Comparaciones por claves de calendario: mes anterior o mismo mes del año previo. No se usan desplazamientos de 21/252 filas. Las tasas diarias se comparan con la observación publicada anterior; en mensual, con el mes previo.
- Se transforma la historia antes de filtrar el rango visible, para conservar la base de comparación del primer mes seleccionado.

## Valores reales e índices

Solo stocks ARS y frecuencia mensual admiten deflactación. Con índice nacional de precios `IPC` y mes base `b`:

`X_real(t) = X_nominal(t) × IPC(b) / IPC(t)`.

La base predeterminada es el último mes con IPC disponible, y puede elegirse otra. Si no hay IPC para el período o la base, el valor real es nulo. No se arrastra el IPC, no se presupone inflación cero y no se crea una curva diaria interpolada.

Las variaciones reales se calculan como cocientes de niveles reales: `100 × [(X(t)/X(t-k))/(IPC(t)/IPC(t-k)) − 1]`, con `k=1` o `12` meses. Cambiar la base de precios no cambia esas variaciones. Las variaciones mensuales de saldos son sin ajuste estacional; no son nuevas colocaciones crediticias.

Índice base100: `100 × X(t)/X(b)`. Por defecto toma el primer dato válido del rango elegido. Con real+base100 y un mes base explícito, ese mismo mes se usa como base de precios y de índice; con base automática se usan último IPC para precios y primera observación del rango para el índice. Un denominador nulo/cero deja el resultado no disponible.

## Tasas y ratios

Las tasas conservan su convención original. Un movimiento de30 a32% TNA equivale a2 puntos porcentuales o200 puntos básicos. No se calcula una variación porcentual de la tasa. Los spreads exigen la misma convención y moneda, alinean fechas y no convierten TNA/TEA/TEM.

El ratio préstamos/depósitos privados requiere misma moneda, sector, cobertura y fecha. En la vista mensual promedio se calcula la **media de ratios diarios** sobre fechas comunes; en cierre, el ratio de la última fecha común. No se confunde con cociente de promedios ni con sistema total. USD nunca se deflacta por IPC argentino.

## Agrupaciones y composición

- Comerciales ARS =110+111+116 (adelantos+documentos+otros); consumo =114+115; garantía real =112+113. USD utiliza118+119+124,122+123 y120+121. Grupos mutuamente excluyentes; no se apilan junto a sus componentes.
- Residuo = total − suma de aperturas de la misma fecha. Se identifica como tal. Un residuo negativo impide usar barras apiladas; se conserva como diferencia en líneas, sin forzarlo a cero.
- M1 privado propio =17+69+94; M2 privado =17+69+94+95; M3 privado =17+69+100. M1 total =17+69+85; M2 total =17+69+85+86; M3 total =17+69+91. Incluyen cheques cancelatorios ARS69. Historia desde2005 para evitar omitir las cuasimonedas que requerirían las definiciones de2003/04. M2 transaccional197 sigue siendo oficial. No se empalman los valores de los antiguos resúmenes diarios terminados en mayo con estas construcciones. Los cierres totales priorizan1612/1618/1624 cuando están disponibles.
- Depósitos públicos USD propios =107−108 (público+privado no financiero menos privado no financiero); evita la serie1494 con metadatos contradictorios. No se deriva un ratio público/total con préstamos de cobertura institucional más amplia.
- Depósitos públicos ARS =91−100; vista =(85−94)+(86−95); plazo =(87−96)+(88−97); residuo =total−vista−plazo. Se calculan sobre fechas comunes de componentes vigentes, netos del Uso del Fondo Unificado de Cuentas Oficiales. Sustituyen en la vista principal a1229/1230/1231, que dejaron de publicar el07/05/2026. No se mezclan CC1457/CA1461, de tratamiento distinto del Fondo. Las aperturas públicas USD se muestran individualmente; su composición queda pendiente de completar y auditar el residuo.
- [Base + instrumentos v2](monetario-instrumentos.md) =1248+1258+1260+1262, incorporando además198 desde15/07/2025. Se conserva la cobertura histórica anterior sin Repo; su aporte previo cero es exclusión de cobertura, no un saldo observado. Total y composición promedian las mismas fechas comunes. No incorpora activos, LEFI ni componentes de base duplicados. Un faltante de Repo desde su inclusión impide el total del día.
- Otros198: otros pasivos del BCRA en millones ARS, desde15/07/2025. Se muestra como «Repo BCRA», rótulo solicitado por el usuario; el nombre y la metodología oficial siguen siendo «Otros» y «Otros pasivos del BCRA». El gráfico de instrumentos muestra las versiones IMD152/154/155/156 sin sufijo, LEFI196 y Repo198, sin duplicados contables ni notas de régimen. La serie individual198 mantiene únicamente datos oficiales; el aporte usado en la composición es un cálculo propio según la cobertura de v2.
- El rango inicial de los gráficos monetarios comienza en2018. Los controles Desde/Hasta y Toda la historia permiten ampliarlo, sin recortar el almacén ni agregar botones de desplazamiento.

## Actualización

`npm run monetary:refresh` actualiza solo BCRA. Consulta catálogo, valida esquema, descarga paginada con caché de6horas/reintentos y conserva cada último conjunto válido ante error. Revisa dos años en cada actualización; cada30días o con `--full` reconcilia la historia completa. Registra valores revisados, observaciones históricas agregadas y retiradas. Una pérdida superior al20% requiere revisión y conserva el conjunto anterior. El lock BCRA es independiente de INDEC.

`npm run update` y la tarea Windows existente ejecutan ambas fuentes aun si falla una. La sincronización Sheets anterior permanece limitada a INDEC. El script Windows publica ambos directorios de datos; GitHub Pages reconstruye el dashboard. En esta ampliación no se ejecutó ninguna escritura a Sheets ni se alteró la planilla de referencia.

Gráficos, tablas y CSV comparten un modelo de datos. PNG y SVG incorporan convención, unidad, rango, fuente y parcialidad, con fondo blanco. El CSV conserva precisión sin redondear y agrega fecha efectiva, marca parcial y conteo de observaciones por serie.
