# Base monetaria más instrumentos: definición auditada v1

Fuente: [catálogo API BCRA v4](https://api.bcra.gob.ar/estadisticas/v4.0/monetarias), metodologías de cada ID y observaciones efectivamente descargadas el 04/11/2026. La construcción propia se llama **Base monetaria + otras letras BCRA ARS + LELIQ/NOTALIQ + pases pasivos**. No se presenta como una Base Monetaria Amplia oficial.

## Lista positiva de componentes

Versión: `bcra-balance-ars-v1`, auditada04/11/2026. Todos los componentes se toman de la categoría contable «Activos y pasivos del BCRA», en millones ARS. La suma se calcula únicamente sobre fechas comunes y valores presentes.

| ID | Componente | Emisor / posición | Valuación y cobertura | Uso |
|---:|---|---|---|---|
| 1248 | Base monetaria | BCRA, pasivo monetario | Serie contable diaria; circulación total + depósitos de entidades en BCRA | Base del agregado |
| 1258 | Otras letras BCRA en pesos | BCRA, pasivo | LEBAC/NOBAC/LEGAR/LEMIN; excluye LELIQ/NOTALIQ, letras afectadas a pases y entregadas en garantía | Elegible |
| 1260 | LELIQ/NOTALIQ | BCRA, pasivo | Letras y notas de liquidez; saldo oficial contable. Sin circulación desde 13/03/2024 según metodología | Elegible |
| 1262 | Pases pasivos | BCRA, pasivo | Posición de pases pasivos concertados por BCRA; serie oficial, no neta de activos | Elegible |

`Total(d)=BCRA1248(d)+BCRA1258(d)+BCRA1260(d)+BCRA1262(d)`.

Se conserva la valuación informada por BCRA; la metodología1258 identifica alcance y exclusiones pero no explicita una regla homogénea de valuación para todas las especies. No se etiqueta esta suma como valor nominal puro o valor de mercado. Es una suma de saldos contables publicados. Las fechas iniciales de catálogo no prueban existencia histórica del instrumento.

La intersección observada empieza cuando existen valores de todos los componentes; para fechas anteriores no se imputan ceros por ausencia. La extinción documentada de LELIQ desde 13/03/2024 no exige imputación: la API efectivamente publica ceros. El último saldo no nulo encontrado es3.000millones al12/03/2024. Pases1262 presenta último saldo no nulo10.852.704millones al19/07/2024 y ceros publicados posteriores. Se usan los ceros de fuente, no una presunción basada en el fin de régimen.

## Exclusiones para evitar dobles conteos y activos

| ID | Serie | Razón de exclusión |
|---:|---|---|
| 1263 /154 | Pases activos | Son activos del BCRA; no pasivos de absorción |
| 1261 | Posición neta de pases | Mezcla pasivos y activos; no se suma junto a1262 |
| 152 /155 /156 | Pases,LELIQ y otras letras del IMD | Se muestran para consulta, pero no se duplican con el juego contable1258/1260/1262; fuentes, cortes y valuaciones pueden diferir |
| 153 | Pases pasivos con FCI | Subconjunto incluido en el total de pases; no se agrega otra vez |
| 157 | LEBAC/NOBAC de entidades | Subconjunto de otras letras; no se suma junto al total |
| 1259 /158 | Letras en moneda extranjera,LEDIV/BOPREAL | Moneda y composición distintas;1259 incluye BOPREAL como garantía desde03/01/2025. Requiere agregado separado y auditoría específica |
| 196 | LEFI en entidades | Emisor Tesoro Nacional, no pasivo del BCRA. Valor técnico; vigencia distinta del rango de catálogo |
| 17 /18 /19 | Circulante público, efectivo bancos, CC BCRA | Componentes de base; no se suman otra vez encima de1248 |
| 46–59 | Factores de explicación | Flujos diarios, no stocks de instrumentos |

LEFI se ofrece solamente como serie histórica individual rotulada Tesoro; no se incluye por haber servido como instrumento de liquidez. Las series de política tampoco se suman a saldos monetarios.

## Fechas, promedios y datos reales

Para un promedio mensual del agregado primero se suman los cuatro componentes en cada fecha común y después se calcula la media de esas sumas. No se suman últimos valores correspondientes a diferentes días ni medias sobre calendarios diferentes. Para el cierre se informa la última fecha común del mes.

Un componente faltante hace al agregado no disponible para esa fecha. Un mes sin cobertura de todos los componentes no se presenta como completo. El mes corriente se rotula parcial. La comparación mensual utiliza meses completos y no aproxima un mes con21filas.

Las barras apiladas se permiten únicamente si todos los componentes presentes son aditivos y no negativos. El gráfico individual de un activo conserva su nombre y signo económico; no se apila como pasivo.

El saldo real mensual se calcula con el IPC nacional nivel general ya integrado y la misma convención mensual. Cuando el IPC del mes no está publicado, el valor real es no disponible. No se usa el último IPC como sustituto. Las variaciones reales son independientes del mes base.

## Contraste

Al30/10/2026 los cuatro valores son47.321.620,243.895,0 y0millones ARS. El agregado propio resulta47.565.515millones ARS. La serieIMD156 reporta242.412,6847millones al02/11/2026: no se reemplaza1258 del30/10 con ese dato de otro día. La base15 y la contable1248 coinciden en la muestra47.321.620millones del30/10; mantener1248 evita cruzar categorías en la definición del agregado.
