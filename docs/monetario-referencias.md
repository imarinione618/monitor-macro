# Auditoría de referencias monetarias

Consulta de solo lectura: 4 de noviembre de 2026. No se modificó la planilla ni el sitio de referencia. Se inspeccionaron CSV públicos y las fórmulas y valores almacenados del XLSX exportado, en memoria. No se recalculó el libro ni se ejecutaron sus funciones personalizadas de Google Sheets.

## Fuentes inspeccionadas

- [Monitor BCRA publicado](https://imarinione618.github.io/monitor-bcra/), HTTP 200.
- [Código del monitor](https://github.com/imarinione618/monitor-bcra/blob/76db5b2da89ecae29a08e6d9e375e9486d08ef24/index.html). Revisión `76db5b2da89ecae29a08e6d9e375e9486d08ef24`, del 13 de marzo de 2026.
- [Libro Google Sheets](https://docs.google.com/spreadsheets/d/1kjSwk4fTjzADeks9ZrZ08do9bAZQD5uKNNOLavqX6Lo/edit). [Exportación XLSX pública](https://docs.google.com/spreadsheets/d/1kjSwk4fTjzADeks9ZrZ08do9bAZQD5uKNNOLavqX6Lo/export?format=xlsx).
- [Catálogo oficial BCRA API v4](https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias?Limit=3000) y [serie 1196](https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/1196).

Los cinco gids indicados permiten exportar CSV sin autenticación. Los nombres exactos se corroboraron con el manifiesto del XLSX:

| gid | Nombre real | Estructura relevante |
| --- | --- | --- |
| 1013302416 | benchmarks | A fecha; B A3500; C CCL; D CER; E Badlar; F Tamar; G caución; Q mes; R brecha. Una fila de encabezado. |
| 244505037 | Tasas | Cuatro filas previas a los datos diarios. C fecha ISO; H Remu; I Tamar; J Badlar; L Personales; M Adelantos; N Pases. Fila 3 identifica códigos BCRA. |
| 1336881351 | Resumen corp | A mes; B préstamos ARS privados; C comerciales; G consumo; J garantía real; L préstamos USD privados; P depósitos ARS privados; W depósitos ARS totales; Z depósitos USD privados; AM IPC index. |
| 536911540 | Depósitos | Datos diarios y bloques mensuales independientes en la misma hoja. Q fecha mensual ARS; W total ARS privado nominal; AF fecha real; AL total ARS privado real. La fecha diaria A no identifica el mes del bloque mensual. |
| 541163462 | Agregados diarios | Bloques diarios originales con sus propias fechas; AB fecha de agregados alineados; AC base; AD circulante; AE:AG M1/M2/M3 privados; AH:AJ M1/M2/M3 totales. |

El libro también tiene una hoja denominada `Resumen`, distinta de `Resumen corp`: no intercambiarlas por nombre.

## Definiciones confirmadas

**Remu.** `Tasas!H3` contiene el código 1196. El catálogo BCRA lo define como tasa de interés de depósitos a la vista remunerados en pesos de prestadores de servicios financieros. Es diaria, moneda local, porcentaje nominal anual, con inicio informado el 2 de enero de 2018. No representa genéricamente una tasa de billeteras o cuentas remuneradas minoristas. La observación 57,64 del 20 de septiembre de 2022 coincide entre `Tasas!H5` y API. El catálogo consultado informa 14,26 para el 2 de noviembre de 2026.

**Otras tasas.** Los códigos de la fila 3 de Tasas son 44 (TAMAR bancos privados), 139 (BADLAR bancos privados), 142 (TM20 bancos privados), 144 (personales al sector privado), 145 (adelantos en cuenta corriente con acuerdo de 1 a 7 días, de 10 millones o más, a empresas del sector privado), y 150 (pases entre terceros a un día). Todas son TNA. No confundir el plazo de adelantos o pases con un plazo de caución.

**Agrupaciones crediticias.** Las fórmulas de `Resumen corp!C2` y `G2` son `SUM(D2:F2)` y `SUM(H2:I2)`, respectivamente. Comerciales agrega adelantos, documentos y otros ARS (códigos BCRA 110, 111 y 116). Consumo agrega personales y tarjetas ARS (114 y 115). La intención explícita de la fórmula de J es sumar hipotecarios y prendarios ARS (112 y 113), pero está rota como se documenta debajo. Las agrupaciones son derivadas del libro; no presentarlas como una única serie oficial con código propio.

**Agregados.** En Agregados diarios las fórmulas buscan las observaciones por fecha: M1 privado = circulante + cuentas corrientes privadas; M2 privado = M1 privado + cajas de ahorro privadas; M3 privado = circulante + depósitos privados totales. Los agregados totales repiten las identidades con depósitos totales. `AH2` dice «Agregados públicos», pero las fórmulas y encabezados de AH:AJ corresponden a totales: ese rótulo es incorrecto.

**Deflactor.** Depósitos AL divide el nominal de W por el IPC index del mismo mes y multiplica por 100. `Agregados Mensuales!AP4` reconstruye el índice a partir de inflación mensual y lo rebasa dinámicamente para que la última observación sea 100. La fórmula inspeccionada de AL27 es `W27/INDEX('Agregados Mensuales'!$K:$K,MATCH($Q27,'Agregados Mensuales'!$A:$A,0))*100`. Esto explica la base de precios del último IPC disponible, que debe identificarse explícitamente. `Resumen corp` convierte los stocks ARS de millones a miles de millones dividiendo por 1000, y mantiene USD en millones. Las variaciones reales son cocientes de stocks deflactados, por ejemplo AP4: `(B4/$AM4)/(B3/$AM3)-1`.

## Problemas que no deben heredarse

1. **Garantía real omite prendarios.** Las 30 fórmulas de `Resumen corp!J2:J31` contienen `MATCH(#REF!,'Préstamos'!$W:$W,0)` en la parte de prendarios, dentro de `IFERROR(...,"")`. El resultado guardado conserva únicamente hipotecarios. Por ejemplo, en mayo de 2026: total privado 96.596,76695; comerciales 38.992,56616; consumo 43.967,25553; «garantía real» 7.533,271526 (miles de millones ARS). La diferencia de aproximadamente 6.103,674 son los prendarios que no aparecen en esa agrupación. No importar J ni su variación real AX como garantía real válida; recalcular desde ambas series originales. No se reparó la planilla.

2. **Ratio total mal rotulado en el sitio.** El código calcula `RATIO_TOT = PREST / DEP_TOT`, siendo PREST préstamos privados de B y DEP_TOT depósitos totales de W. La leyenda «Préstamos / Depósitos Total» y «sistema total» ocultan que el numerador es privado. La planilla sí identifica BS como préstamos privados / depósitos totales. Otros ratios: BT=B/P (ambos privados ARS); BU=B/(S+T) (depósitos privados a plazo, incluyendo CER); BV=L/AB (préstamos USD privados / depósitos USD totales). Identificar siempre ambas poblaciones.

3. **Unión de depósitos reales por monto.** El sitio busca el nominal más cercano a `DEPO_NOM*1000` en lugar de unir por fecha. Puede atribuir a un mes valores reales de otro. Además filtra con la fecha diaria A aunque el bloque mensual tiene sus fechas en Q/AF. Usar fecha mensual, precisión original y unidad explícita.

4. **Variaciones diarias con horizontes incorrectos.** Benchmarks incluye días calendario y valores repetidos en días no hábiles. El sitio interpreta retrocesos de 5, 21 y 63 filas como una semana, un mes y tres meses; no equivalen a esos períodos en esa tabla. Buscar por fecha y definir la regla para días sin observación.

5. **Cambio de brecha mal calculado.** En el objeto de la tarjeta Brecha, la expresión con resta y operador ternario no agrupa el ternario como sustraendo; normalmente termina devolviendo la brecha histórica en lugar de la diferencia. Calcular por separado brecha actual e histórica, restarlas y expresar la diferencia en puntos porcentuales.

6. **Unidades de cambios de tasas.** El sitio calcula diferencias de TNA y las etiqueta con `%`; son puntos porcentuales. Tampoco debe convertir ausencia de datos en cero: `chg` devuelve 0 ante faltantes y `brechaLast` usa `?? 0`.

7. **Fechas, precisión y cobertura.** El CSV de benchmarks tiene una sola fila de encabezado, pero `slice(2)` omite 31/12/2023. Mezcla la representación `12/31/2023` con `dd/mm/yy`. El sitio redondea stocks antes de formar ratios. La extracción observada de benchmarks termina el 13/03/2026; Resumen corp llega a mayo de 2026; los datos oficiales de Remu llegan al 02/11/2026. No usar una única fecha de actualización para todas las series ni asumir que la etiqueta «En vivo» significa datos actuales.

## Caución: definición pendiente

> **Actualización 2026-11-06:** el dashboard ya no depende de `benchmarks!G`. Se integró directamente la fuente explícita: A3 Mercados, índice I.CAUCION: tasa de referencia diaria de caución en pesos a 1 día hábil, mediana ponderada por volumen redondeada al punto básico, publicada cada día hábil a las 17:05 (metodología A3). Endpoint público `https://ws.matbarofex.com.ar:8999/api/caucion?from=…&to=…&closed_value=1` (el mismo que usa la función de Apps Script del usuario `TasaCaucion1DiaHistoricas`). Historia desde 07/11/2024. Serie `monetario.a3.caucion` (`provider: 'A3'`, `bcraId: -1`), en `data/monetary`, actualizada con `npm run monetary:refresh` (no con `--ids`). La columna del libro de referencia sigue sin trazabilidad propia.

`benchmarks!G1` sólo dice «Tasa Caución». Las celdas inspeccionadas G2, G3 y G800 son valores directos, sin fórmula. El XLSX no contiene comentarios ni vínculos externos que documenten mercado, moneda, plazo, ponderación o proveedor. El código del sitio sólo añade la unidad TNA. No hay evidencia suficiente para llamarla caución BYMA, a un día, a siete días, ni para atribuirla al BCRA. Tampoco hay trazabilidad del proveedor de CCL en esa columna del libro. Cualquier integración debe conservar la identificación como pendiente o conseguir una fuente explícita, sin inventar esas dimensiones.

## Límites de la revisión

Se inspeccionaron fórmulas representativas y se contó el defecto #REF! de Resumen corp, no se certificó cada celda del libro. Los resultados XLSX son valores guardados por Google Sheets; no prueban que funciones personalizadas como `SerieHistoricaVariable` vayan a recalcular en Excel. No fue necesario usar credenciales ni OAuth. Los errores `#DIV/0!` iniciales en los bloques mensuales reflejan meses sin cobertura diaria y deben conservarse como ausencias al importar. La página se comprobó por HTTP y código fuente, sin una prueba visual de interacción.
