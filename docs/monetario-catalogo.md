# Catálogo monetario y correspondencias

Auditoría: 4 de noviembre de 2026. Fuente principal: [API BCRA vigente](https://www.bcra.gob.ar/apis-banco-central/), [documentación v4](https://www.bcra.gob.ar/documentacion-apis/?fileName=estadisticas-monetarias-v4), [manual técnico](https://www.bcra.gob.ar/archivos/Catalogo/Content/files/pdf/principales-variables-v4.pdf). Consulta sin autenticación y en modo lectura. No se escribe en las planillas de referencia.

El catálogo oficial completo devuelve 1.610 variables; cada identificación se contrastó con descripción, tipo, frecuencia, moneda, unidad, fechas y metodología v4. El [catálogo declarativo](../src/monetary/catalog.ts) conserva estos metadatos y enlaza el endpoint exacto. Se ingieren 85 series, con historia completa disponible, sin recorte temporal. La interfaz consulta el almacén local y no depende operativamente de Google Sheets.

## Contrato y actualización

- `GET /estadisticas/v4.0/monetarias`: catálogo paginado por `offset`, `limit`; `metadata.resultset.count` es el total esperado.
- `GET /monetarias/{id}?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: observaciones en `results[].detalle[]`, campos `fecha`, `valor`. Se verifica el ID, el total paginado y cada fecha y valor. Máximo usado: 3.000 observaciones por página.
- `GET /metodologia/{id}`: explicación oficial de la serie.
- Datos monetarios en [data/monetary](../data/monetary), independientes del registro de INDEC y de Sheets. Escritura atómica, lock propio, manifest de estado y registro de revisiones. Las fallas conservan el último conjunto válido y marcan la serie como rezagada.
- Caché local de respuestas durante seis horas; `--full` evita el caché y reconcilia la historia. Las actualizaciones normales revisan dos años; cada treinta días se vuelve a reconciliar completamente. No se añaden ceros ni se arrastran valores faltantes.
- Una discrepancia de descripción, unidad o frecuencia del catálogo vigente detiene esa serie para revisión, sin afectar otras fuentes.
- `retrievedAt` es consulta; la fecha de cada observación es referencia, no publicación. La API no informa fecha de publicación individual.

## Correspondencias principales

| Referencia | ID BCRA v4 | Transformación | Ubicación |
|---|---:|---|---|
| TAMAR | 44 | TNA original; diaria / media mensual de observaciones | Tasas pasivas |
| BADLAR | 7 | TNA original; diaria / media mensual de observaciones | Tasas pasivas |
| Remu | 1196 | TNA de vista remunerada de prestadores de servicios financieros; código confirmado en Tasas!H3 | Tasas pasivas |
| Política | 160 | Historia oficial con cambios de régimen indicados; finaliza 10/07/2025 | Tasas de referencia |
| Personales / adelantos | 14 / 13 | TNA; diferencias en p.p. o pb | Tasas activas |
| Depósitos privados ARS | 100 | Saldo diario; media de observaciones / último saldo publicado del mes | Depósitos y préstamos |
| Préstamos privados ARS | 117 | Saldo neto de intereses documentados; misma agregación | Depósitos y préstamos |
| Depósitos / préstamos privados USD | 108 / 125 | Dólares corrientes; sin IPC argentino | Depósitos y préstamos |
| Depósitos CC / CA / plazo | 94 / 95 / 96+97 | Suma de plazo ajustable y no ajustable solo en fechas comunes | Depósitos y préstamos |
| Crédito comercial (definición referencia) | 110+111+116 | Adelantos + documentos + otros; no volver a sumar otros por separado | Depósitos y préstamos |
| Crédito consumo | 114+115 | Personales + tarjetas | Depósitos y préstamos |
| Crédito garantía real | 112+113 | Hipotecarios + prendarios | Depósitos y préstamos |
| Base monetaria | 15; cierre oficial 1606 | Millones ARS; cierre mensual1606 normalizado ×0,001 | Variables monetarias |
| Circulante público | 17 | No confundir con circulación total ni efectivo en bancos18 | Variables monetarias |
| M1 / M2 / M3 total diario | 17+69+85 / 17+69+85+86 / 17+69+91 | Cálculos propios desde2005;1232/1233/1234 se conservan históricos | Variables monetarias |
| M1 / M2 / M3 total cierre mensual | 1612 / 1618 / 1624 | Miles a millones ARS ×0,001; cierre oficial | Variables monetarias |
| M2 privado / transaccional privado | 17+69+94+95 / 197 | Primero cálculo propio; segundo oficial, resta vista remunerada jurídica | Variables monetarias |
| Depósitos públicos ARS | 91−100 | Total menos privados, fechas comunes, neto de Uso FUCO | Depósitos y préstamos |
| Otros pasivos BCRA ARS | 198 | Saldo diario oficial; historia desde15/07/2025 | Instrumentos por separado |
| Base + instrumentos | 1248+1258+1260+1262; agrega198 desde15/07/2025 | Construcción propia v2, fechas comunes; cobertura histórica anterior sin Repo | Variables monetarias y composición |

La agrupación comercial de la referencia incluye otros; esa categoría no vuelve a sumarse por separado en la composición agrupada. En la vista por líneas puede mostrarse individualmente. No se incluyen simultáneamente un total y sus componentes. En depósitos debe calcularse un residuo explícito si se grafican solo CC, CA y plazo.

## Convenciones y alcance

Las tasas son TNA: los cambios se expresan en puntos porcentuales o básicos. BADLAR7 no es BADLAR35 (TEA); TAMAR44 no es TAMAR45 (TEA). No se hace conversión automática. El promedio mensual de tasas diarias es una media temporal de las observaciones publicadas: no se presenta como una tasa mensual ponderada por montos operados. Las tasas mensuales activas1215–1219 conservan su convención oficial.

Para saldos, la media mensual usa únicamente observaciones diarias publicadas, sin completar fines de semana, feriados ni faltantes hábiles. El cierre usa el último dato válido e informa su fecha efectiva. La media de componentes usa la intersección de fechas antes de sumar; sumar medias de calendarios diferentes no garantiza igualdad. Se identifica el mes en curso como parcial y no se usa por defecto para variaciones mensuales. Los cierres oficiales tienen prioridad donde su unidad y cobertura están verificadas (base y M1/M2/M3).

La vista real usa exclusivamente el IPC nacional nivel general ya integrado: `X_real(t)=X_nominal(t)×IPC(base)/IPC(t)`. Si no hay IPC del mes, no hay valor real. No se deflactan USD y no se interpolan índices diarios. Las variaciones se alinean por mes calendario, conservan la convención de saldo y son sin ajuste estacional.

Moneda de denominación no es unidad: la API etiqueta `ME` a series expresadas en ARS o en USD; se verifica `unidadExpresion` individualmente. No se suman monedas. Privado+público no financiero (91/107) no equivale al total de sectores (1370/1415), que incluye financiero y exterior. Las series1314/1328/1276/1297 se conservan con su cobertura de préstamos de efectivo y no se cruzan automáticamente con totales de depósitos de distinta cobertura.

## Discrepancias oficiales verificadas y pendientes

1. **Mensuales992 y893 excluidos del catálogo operativo.** Declaran miles ARS, pero al aplicar esa escala quedan aproximadamente mil veces debajo del saldo diario comparable. Al31/08/2026, depósitos100=126.016.828 millones y992 bruto=125.898.002; préstamos117=106.542.291 millones y893 bruto=106.545.854. No se adivina una escala a partir de montos. Se requiere confirmación de BCRA; mientras tanto, se calcula cierre desde diarios. En contraste, base1606 bruto47.451.536.857 miles →47.451.536,857 millones coincide con15=47.451.537 millones (redondeo diario).
2. **Depósitos públicos USD1494 excluido:** catálogo dice ML/millones ARS mientras metodología dice moneda extranjera. No se renombra como USD. El total públicoUSD puede construirse como107−108 en fechas comunes, con rótulo derivado; sus aperturas1495/1499/1501 sí especifican USD.
3. **M1/M2/M3 diarios1232/1233/1234 y depósitos públicos1229/1230/1231 terminan07/05/2026; M2privado1239 termina22/05/2026.** Se conservan históricos y la vista principal usa cálculos propios con componentes vigentes, sin empalmar los valores antiguos. Cierres1612/1618/1624 llegan a agosto2026 y son una convención distinta. Ver identidades en [metodología](monetario-metodologia.md).
4. **Caución:** no se atribuye al BCRA; hace falta una fuente de mercado verificable con plazo y convención. Los pases entre terceros150 no se renombran caución.
5. **Remu:** 1196 significa tasa de vista remunerada de FCI, seguros y fiduciarios financieros. La correspondencia concreta quedó confirmada mediante el ID en Tasas!H3 y una observación histórica; ver [auditoría de referencias](monetario-referencias.md). No es tasa genérica de proveedores de servicios de pago ni tasa de política.
6. **Política:**160 contiene regímenes distintos (LEBAC35d, corredor pases7d, LELIQ, pases1d, LEFI). La metodología documenta cada cambio y deja de anunciarse desde11/07/2025. No se empalma con TAMAR.
7. Los depósitos/préstamos mensuales de titulares se basan en saldos de cierre del régimen informativo y pueden repetir el saldo previo del informante según metodología BCRA. No deben usarse para simular un promedio de los diarios.

## Muestra de validación de origen

Consulta oficial al 04/11/2026, comparada con último valor del catálogo y respuesta histórica, sin redondear en almacenamiento:

| Variable | Fecha de referencia | Valor | Unidad |
|---|---|---:|---|
| TAMAR44 | 2026-11-02 | 23,9375 | % TNA |
| BADLAR7 | 2026-11-02 | 22,3125 | % TNA |
| Vista remunerada1196 | 2026-11-02 | 14,26 | % TNA |
| Depósitos privados100 | 2026-10-29 | 126.797.637 | Millones ARS |
| Préstamos privados117 | 2026-10-29 | 109.928.069 | Millones ARS |
| Depósitos privadosUSD108 | 2026-10-29 | 42.806 | Millones USD |
| Préstamos privadosUSD125 | 2026-10-29 | 26.311 | Millones USD |
| Base contable1248 | 2026-10-30 | 47.321.620 | Millones ARS |
| Otras letras1258 | 2026-10-30 | 243.895 | Millones ARS |
| LELIQ1260 / pases pasivos1262 | 2026-10-30 | 0 /0 | Millones ARS |

La documentación del catálogo es un inventario verificable; no supone que todas las series tengan idéntica fecha de actualización ni igual cobertura histórica.

## Contraste con la planilla: mayo de 2026

Se calculó la media de 19 observaciones publicadas, del 4 al 29 de mayo, con idénticas fechas para las sumas. Los siguientes valores se expresan en **miles de millones de ARS** exclusivamente para compararlos con Resumen corp (el almacén conserva millones sin redondear):

| Concepto | API y cálculo compartido | Valor guardado en referencia | Evaluación |
|---|---:|---:|---|
| Préstamos privados 117 | 96.596,76694736843 | 96.596,76695 | Coincide a precisión mostrada |
| Comerciales 110+111+116 | 38.992,56615789474 | 38.992,56616 | Coincide; incluye otros |
| Consumo 114+115 | 43.967,255526315785 | 43.967,25553 | Coincide a precisión mostrada |
| Hipotecarios 112 | 7.533,27152631579 | 7.533,271526 en garantía real | La referencia solo conserva hipotecarios |
| Prendarios 113 | 6.103,673736842105 | Omitidos por fórmula rota | Diferencia identificada |
| Garantía real 112+113 | 13.636,945263157895 | 7.533,271526 | Se corrige la omisión; no se fuerza coincidencia |

La suma de comerciales, consumo y garantía real corregida reconcilia con el total privado. La variante adelantos+documentos sin otros sería 32.672,15052631579, una definición diferente que no debe rotularse como réplica exacta de la agrupación del libro. Depósitos privados100 arroja 114.316,83442105263 miles de millones para el mismo mes; se informa como contraste de fuente, sin afirmar coincidencia con una celda de referencia no contrastada.
