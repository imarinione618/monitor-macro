# Catálogo de dimensiones — API INDEC

_Generado automáticamente por `npm run data:discover` el 2026-11-04 contra la API real. No editar a mano._

Método: tablas de hasta 20.000 filas se relevan completas; las más grandes, solo en su período más reciente (los valores de dimensión de períodos anteriores pueden diferir). No se aplican los `fetchFilters` de `src/core/datasets.ts`. Las columnas `*_null` no están documentadas en el OpenAPI: contienen el signo convencional que explica un valor nulo (ver docs/api-auditoria.md).

| Endpoint | Filas totales | Primer período | Último período | Muestra | Series en el registro |
|---|---:|---|---|---|---:|
| `/estimador-mensual-de-actividad-economica-nivel-general` | 1.632 | 200401 | 202608 | tabla completa (1.632 filas) | 5 |
| `/estimador-mensual-de-actividad-economica-sectores` | 8.512 | 200401 | 202608 | tabla completa (8.512 filas) | 16 |
| `/ipi_manufacturero` | 41.344 | 201601 | 202608 | solo el período más reciente (periodo = 202608) (323 filas) | 35 |
| `/ipi_minero` | 17.632 | 201701 | 202608 | tabla completa (17.632 filas) | 0 |
| `/ipc_nacional` | 234.198 | 201604 | 202609 | solo el período más reciente (periodo = 202609) (2.048 filas) | 25 |
| `/valorizacion_canastas_cba_cbt` | 1.638 | 201604 | 202609 | tabla completa (1.638 filas) | 4 |
| `/indice_salarios` | 3.406 | 201510 | 202608 | tabla completa (3.406 filas) | 5 |
| `/icc_precios_construccion` | 14.017 | 201511 | 202609 | tabla completa (14.017 filas) | 4 |
| `/sipm_precios_mayoristas` | 234.260 | 201512 | 202609 | solo el período más reciente (periodo = 202609) (1.802 filas) | 7 |
| `/mercado_trabajo_eph` | 41 | 20162T | 20262T | tabla completa (41 filas) | 9 |
| `/pobreza_eph` | 20 | 20162S | 20261S | tabla completa (20 filas) | 4 |
| `/comercio_exterior_exportacion_bienes` | 779.536 | 198601 | 202609 | solo el período más reciente (Periodo = 202609) (1.891 filas) | 9 |
| `/comercio_exterior_importacion_bienes` | 390.315 | 198601 | 202609 | solo el período más reciente (Periodo = 202609) (1.041 filas) | 11 |
| `/comercio_exterior_nomenclaturas` | 325 | — | — | tabla completa (325 filas) | 0 |

## EMAE — Nivel general — `/estimador-mensual-de-actividad-economica-nivel-general`

Filas totales: 1.632 · períodos 200401 → 202608 · muestra: tabla completa (1.632 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `tipo_de_indicador_descripcion` | dimension | 6 | 1.632 |
| `anio` | periodo | — | 1.632 |
| `mes` | periodo | — | 1.632 |
| `periodo` | periodo | — | 1.632 |
| `tipo_de_indicador` | dimension | 2 | 1.632 |
| `valor` | valor | 1.619 | 1.618 |
| `valor_null` | signo | 2 | 14 |
| `observaciones` | observaciones | 1 | 0 |

**Combinaciones `tipo_de_indicador_descripcion` × `tipo_de_indicador`** (6):

- Índice serie desestacionalizada · Índice base 2004=100 — 272 filas
- Índice serie original · Índice base 2004=100 — 272 filas
- Índice serie tendencia-ciclo · Índice base 2004=100 — 272 filas
- Var % interanual serie original · Variación porcentual — 272 filas
- Var % mensual serie desestacionalizada · Variación porcentual — 272 filas
- Var % mensual serie tendencia-ciclo · Variación porcentual — 272 filas

**`tipo_de_indicador_descripcion`** (dimension, 6 valores):

`Índice serie desestacionalizada` [272] · `Índice serie original` [272] · `Índice serie tendencia-ciclo` [272] · `Var % interanual serie original` [272] · `Var % mensual serie desestacionalizada` [272] · `Var % mensual serie tendencia-ciclo` [272]

**`tipo_de_indicador`** (dimension, 2 valores):

`Índice base 2004=100` [816] · `Variación porcentual` [816]

**`valor_null`** (signo, 2 valores):

`///` [14] · `∅` [1.618]

**`observaciones`** (observaciones, 1 valores):

`∅` [1.632]

## EMAE — Sectores (serie original) — `/estimador-mensual-de-actividad-economica-sectores`

Filas totales: 8.512 · períodos 200401 → 202608 · muestra: tabla completa (8.512 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `anio` | periodo | — | 8.512 |
| `mes` | periodo | — | 8.512 |
| `codigo` | dimension | 16 | 8.512 |
| `descripcion` | dimension | 16 | 8.512 |
| `periodo` | periodo | — | 8.512 |
| `tipo_de_indicador` | dimension | 2 | 8.512 |
| `valor` | valor | 8.512 | 8.512 |
| `valor_null` | signo | 1 | 0 |
| `observaciones` | observaciones | 1 | 0 |

**Combinaciones `codigo` × `descripcion`** (16):

- A · Agricultura, ganadería, caza y silvicultura — 532 filas
- B · Pesca — 532 filas
- C · Explotación de minas y canteras — 532 filas
- D · Industria manufacturera — 532 filas
- E · Electricidad, gas y agua — 532 filas
- F · Construcción — 532 filas
- G · Comercio mayorista, minorista y reparaciones — 532 filas
- H · Hoteles y restaurantes — 532 filas
- I · Transporte y comunicaciones — 532 filas
- J · Intermediación financiera — 532 filas
- K · Actividades inmobiliarias, empresariales y de alquiler — 532 filas
- L · Administración pública y defensa; planes de seguridad social de afiliación obligatoria — 532 filas
- M · Enseñanza — 532 filas
- N · Servicios sociales y de salud — 532 filas
- O · Otras actividades de servicios comunitarios, sociales y personales — 532 filas
- T_S · Impuestos netos de subsidios — 532 filas

**Combinaciones `tipo_de_indicador`** (2):

- Índice base 2004=100 — 4.352 filas
- Variación porcentual interanual — 4.160 filas

**`codigo`** (dimension, 16 valores):

`A` [532] · `B` [532] · `C` [532] · `D` [532] · `E` [532] · `F` [532] · `G` [532] · `H` [532] · `I` [532] · `J` [532] · `K` [532] · `L` [532] · `M` [532] · `N` [532] · `O` [532] · `T_S` [532]

**`descripcion`** (dimension, 16 valores):

`Actividades inmobiliarias, empresariales y de alquiler` [532] · `Administración pública y defensa; planes de seguridad social de afiliación obligatoria` [532] · `Agricultura, ganadería, caza y silvicultura` [532] · `Comercio mayorista, minorista y reparaciones` [532] · `Construcción` [532] · `Electricidad, gas y agua` [532] · `Enseñanza` [532] · `Explotación de minas y canteras` [532] · `Hoteles y restaurantes` [532] · `Impuestos netos de subsidios` [532] · `Industria manufacturera` [532] · `Intermediación financiera` [532] · `Otras actividades de servicios comunitarios, sociales y personales` [532] · `Pesca` [532] · `Servicios sociales y de salud` [532] · `Transporte y comunicaciones` [532]

**`valor_null`** (signo, 1 valores):

`∅` [8.512]

**`observaciones`** (observaciones, 1 valores):

`∅` [8.512]

## IPI manufacturero — `/ipi_manufacturero`

Filas totales: 41.344 · períodos 201601 → 202608 · muestra: solo el período más reciente (periodo = 202608) (323 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `periodo` | periodo | — | 323 |
| `anio` | periodo | — | 323 |
| `mes` | periodo | — | 323 |
| `indicador` | dimension | 1 | 323 |
| `cuadro_web` | dimension | 5 | 323 |
| `codigo_CLaNAE_2004` | dimension | 82 | 323 |
| `descripcion` | dimension | 84 | 323 |
| `serie` | dimension | 3 | 323 |
| `tipo_de_indicador` | dimension | 4 | 323 |
| `unidad_de_medida` | dimension | 2 | 323 |
| `valor` | valor | 318 | 317 |
| `valor_null` | signo | 2 | 6 |

**Combinaciones `cuadro_web` × `serie` × `tipo_de_indicador` × `unidad_de_medida`** (7):

- Cuadro 2 · Serie original · Índice · Numero índice — 85 filas
- Cuadro 3 · Serie original · Variación interanual · % — 85 filas
- Cuadro 4 · Serie original · Variación acumulada interanual · % — 85 filas
- Cuadro 5 · Serie desestacionalizada · Índice · Numero índice — 17 filas
- Cuadro 5 · Serie desestacionalizada · Variación intermensual · % — 17 filas
- Cuadro 6 · Serie tendencia-ciclo · Índice · Numero índice — 17 filas
- Cuadro 6 · Serie tendencia-ciclo · Variación intermensual · % — 17 filas

**`indicador`** (dimension, 1 valores):

`IPI manufacturero` [323]

**`cuadro_web`** (dimension, 5 valores):

`Cuadro 2` [85] · `Cuadro 3` [85] · `Cuadro 4` [85] · `Cuadro 5` [34] · `Cuadro 6` [34]

**`codigo_CLaNAE_2004`** (dimension, 82 valores):

`15` [7] · `16` [7] · `17` [7] · `18-19` [7] · `20-22` [7] · `23` [7] · `24` [7] · `25` [7] · `26` [7] · `27` [7] · `28` [7] · `29` [7] · `30-33` [7] · `34` [7] · `35` [7] · `36-38` [7] · `292, excepto 2921` [3] · `2411, excepto 24111` [3] · `15111` [3] · `15112` [3] · `15113` [3] · `15120/330/499` [3] · `15130` [3] · `15140` [3] · `15200` [3] · `15311/12/13/20` [3] · `15411/12/41/42` [3] · `15420/30` [3] · `15491/2/3` [3] · `15510/29/30/41/42/49` [3] · `15521` [3] · `16001` [3] · `16009` [3] · `17111/2` [3] · `17113` [3] · `17114/15/20` [3] · `17210/20/30/90` [3] · `18110/120/401/402/900` [3] · `19110/20` [3] · `19201/2/3/4` [3] · `20100/210/220/230/290` [3] · `21010/20/91/99` [3] · `22110/120/190/210/220` [3] · `23100/200/300` [3] · `23200` [12] · `24111` [3] · `24120/210` [3] · `24130` [3] · `24220` [3] · `24231/2/3/9` [3] · `24241/9` [3] · `24290/300` [3] · `25110` [3] · `25190` [3] · `25201/9` [3] · `26101/2/9` [3] · `26910/30` [3] · `26920/60/90` [3] · `26941` [3] · `26942` [3] · `26951/9` [3] · `27100` [3] · `27201/9` [3] · `27310/20` [3] · `28110` [3] · `28120/130/910/920/930/999` [3] · `28991` [3] · `29110/20/30/40/50/90` [3] · `29211/2/3` [3] · `29300` [3] · `30000/32100/200/300` [3] · `31100/200/300/400/500/900` [3] · `33110/120/200/300/400` [3] · `34100` [3] · `34200` [3] · `34300` [3] · `35110/120/200/300/990` [3] · `35910` [3] · `36101/2/3` [3] · `36900` [3]
… y 2 valores más.

**`descripcion`** (dimension, 84 valores):

`Agroquímicos` [3] · `Alimentos y bebidas` [7] · `Aluminio y otros metales no ferrosos` [3] · `Aparatos de uso doméstico` [3] · `Artículos de cemento y de yeso` [3] · `Asfaltos` [3] · `Autopartes` [3] · `Azúcar, productos de confitería y chocolate` [3] · `Cal y yeso` [3] · `Calzado y sus partes` [3] · `Carne aviar` [3] · `Carne vacuna` [3] · `Carrocerías, remolques y semirremolques` [3] · `Cemento` [3] · `Cigarrillos` [3] · `Curtido y artículos de cuero, excepto prendas` [3] · `Detergentes, jabones y productos personales` [3] · `Edición e impresión` [3] · `Envases metálicos` [3] · `Equipos y aparatos de informática, televisión y comunicaciones, y componentes electrónicos` [3] · `Equipos y aparatos eléctricos` [3] · `Fiambres y embutidos` [3] · `Fueloil` [3] · `Fundición de metales` [3] · `Galletitas, productos de panadería y pastas` [3] · `Gaseosas, aguas, sodas, cervezas, jugos para diluir, sidras y bebidas espirituosas` [3] · `Gases industriales` [3] · `Gasoil` [3] · `Hilados de algodón` [3] · `Industria siderúrgica` [3] · `Industrias metálicas básicas` [7] · `Instrumentos médicos, ópticos y de precisión` [3] · `IPI Manufacturero - Nivel general` [7] · `Madera y productos de madera y corcho, excepto muebles` [3] · `Madera, papel, edición e impresión` [7] · `Manufacturas de plástico` [3] · `Maquinaria agropecuaria` [3] · `Maquinaria de uso general` [3] · `Maquinaria y equipo` [7] · `Materias primas plásticas y caucho sintético` [3] · `Molienda de cereales` [3] · `Molienda de oleaginosas` [3] · `Motocicletas` [3] · `Muebles y colchones` [3] · `Muebles y colchones, y otras industrias manufactureras` [7] · `Naftas` [3] · `Neumáticos` [3] · `Otra maquinaria de uso especial` [3] · `Otras industrias manufactureras` [3] · `Otro equipo de transporte` [10] · `Otros equipos, aparatos e instrumentos` [7] · `Otros productos alimenticios` [3] · `Otros productos de caucho` [3] · `Otros productos de la refinación del petróleo, coque y combustible nuclear` [3] · `Otros productos de metal y servicios de trabajo de metales` [3] · `Otros productos minerales no metálicos` [3] · `Otros productos químicos` [3] · `Otros productos textiles` [3] · `Papel y productos de papel` [3] · `Pinturas` [3] · `Prendas de vestir` [3] · `Prendas de vestir, cuero y calzado` [7] · `Preparación de fibras de uso textil` [3] · `Preparación de frutas, hortalizas y legumbres` [3] · `Preparación de hojas de tabaco` [3] · `Productos de arcilla y cerámica no refractaria` [3] · `Productos de caucho y plástico` [7] · `Productos de metal` [7] · `Productos de tabaco` [7] · `Productos farmacéuticos` [3] · `Productos lácteos` [3] · `Productos metálicos para uso estructural` [3] · `Productos minerales no metálicos` [7] · `Productos químicos básicos` [3] · `Productos textiles` [7] · `Reciclamiento y reparación, instalación y mantenimiento` [3] · `Refinación del petróleo, coque y combustible nuclear` [7] · `Sustancias y productos químicos` [7] · `Tejidos y acabado de productos textiles` [3] · `Vehículos automotores` [3]
… y 4 valores más.

**`serie`** (dimension, 3 valores):

`Serie desestacionalizada` [34] · `Serie original` [255] · `Serie tendencia-ciclo` [34]

**`tipo_de_indicador`** (dimension, 4 valores):

`Índice` [119] · `Variación acumulada interanual` [85] · `Variación interanual` [85] · `Variación intermensual` [34]

**`unidad_de_medida`** (dimension, 2 valores):

`%` [204] · `Numero índice` [119]

**`valor_null`** (signo, 2 valores):

`∅` [317] · `s` [6]

## IPI minero — `/ipi_minero`

Filas totales: 17.632 · períodos 201701 → 202608 · muestra: tabla completa (17.632 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `periodo` | periodo | — | 17.632 |
| `anio` | periodo | — | 17.632 |
| `mes` | periodo | — | 17.632 |
| `indicador` | dimension | 1 | 17.632 |
| `cuadro_web` | dimension | 7 | 17.632 |
| `codigo_ClaNAE_2010` | dimension | 16 | 17.632 |
| `codigo_CPC_2_1` | dimension | 48 | 17.632 |
| `serie` | dimension | 3 | 17.632 |
| `descripcion` | dimension | 52 | 17.632 |
| `tipo_de_indicador` | dimension | 5 | 17.632 |
| `unidad_de_medida` | dimension | 5 | 17.632 |
| `valor` | valor | 15.577 | 15.989 |
| `valor_null` | signo | 3 | 1.643 |

**Combinaciones `cuadro_web` × `serie` × `tipo_de_indicador` × `unidad_de_medida`** (10):

- Cuadro 1 · Serie Desestacionalizada · Índice · Número índice — 116 filas
- Cuadro 1 · Serie Desestacionalizada · Variación intermensual · % — 116 filas
- Cuadro 1 · Serie Tendencia-Ciclo · Índice · Número índice — 116 filas
- Cuadro 1 · Serie Tendencia-Ciclo · Variación intermensual · % — 116 filas
- Cuadro 2 · Serie Original · Índice · Número índice — 5.452 filas
- Cuadro 3 · Serie Original · Variación interanual · % — 5.452 filas
- Cuadro 4 · Serie Original · Variación acumulada interanual · % — 5.452 filas
- Cuadro 5 · Serie Original · Unidades físicas · miles de m³ — 348 filas
- Cuadro 6 · Serie Original · Unidades físicas · millones de m³ — 348 filas
- Cuadro 7 · Serie Original · Unidades físicas · toneladas — 116 filas

**`indicador`** (dimension, 1 valores):

`IPI Minero` [17.632]

**`cuadro_web`** (dimension, 7 valores):

`Cuadro 1` [464] · `Cuadro 2` [5.452] · `Cuadro 3` [5.452] · `Cuadro 4` [5.452] · `Cuadro 5` [348] · `Cuadro 6` [348] · `Cuadro 7` [116]

**`codigo_ClaNAE_2010`** (dimension, 16 valores):

`05.100 y 08` [348] · `05.100 y 08.920/90` [2.436] · `06 y 09.1` [348] · `06.100` [696] · `06.200` [696] · `07.10 y 07.29` [348] · `07.100 y 07.299` [348] · `07.291` [696] · `08.110` [1.740] · `08.120` [1.392] · `08.130` [2.436] · `08.140` [1.740] · `08.912` [1.856] · `08.930` [1.392] · `09.100` [348] · `B` [812]

**`codigo_CPC_2_1`** (dimension, 48 valores):

`-` [812] · `110, 151/2/3/4 y 161/2/3` [348] · `11010/50, 15130/320 y 16321/22/91/92/93/99` [348] · `12010` [696] · `12010/20 y 86221` [348] · `12020` [696] · `14100 y 14210/41/42/90` [348] · `15120/30 y 16330` [348] · `15120/220/311/312/320` [348] · `15210/20` [348] · `15401/2` [348] · `16193` [348] · `16193/4/5/6 y 16399` [348] · `16201/2/3` [348] · `86221` [348] · `1101004, 1632103/105/106/202 y 1639101/102/304` [348] · `1105001` [348] · `1410001, 1421001 y 1429005/06/12/99` [348] · `1424101/201` [348] · `1424203` [348] · `1512004, 1522005 y 1532011` [348] · `1513001 y 1639202/3` [348] · `1513002 y 15130021/3` [348] · `1513004` [348] · `1521001` [348] · `1522001/04/99` [348] · `1522002` [348] · `1531101` [348] · `1531201/2` [348] · `1531203` [348] · `1532001` [348] · `1532008` [348] · `1532010` [348] · `1540101/201` [348] · `1540102` [348] · `1540204` [348] · `1540205/7` [348] · `1619301/2` [116] · `1619401` [348] · `1619503/4/5/6/9 ` [348] · `1619605 y 1639907/8` [348] · `1620102` [348] · `1620201/202/302` [348] · `1620303` [348] · `1632108/9201` [348] · `1633001` [348] · `1639302/906` [348] · `15120011/12/22/31/32, 15130032/82 y 1513005` [348]

**`serie`** (dimension, 3 valores):

`Serie Desestacionalizada` [232] · `Serie Original` [17.168] · `Serie Tendencia-Ciclo` [232]

**`descripcion`** (dimension, 52 valores):

`Arcilla común (cerámicas, ferruginosas, misceláneas)` [348] · `Arcillas plásticas` [348] · `Arena común para construcción` [348] · `Arenas de fractura (fracking)` [348] · `Arenas industriales y arenas y gravas silíceas` [348] · `Bullón Dorado , Doré ` [348] · `Calcita/carbonato de calcio` [348] · `Canto rodado, granza y/o ripio` [348] · `Caolín y bentonita` [348] · `Carbonato de litio` [116] · `Carbonato de litio y otros minerales de litio` [348] · `Clínker` [348] · `Cloruro de sodio puro` [348] · `Cuarzo amatista y cuarzo` [348] · `Diatomita y perlita` [348] · `Dolomita cruda, excepto para uso de cal o cemento` [348] · `Extracción de arcilla y caolín` [348] · `Extracción de arenas, canto rodado y triturados pétreos` [348] · `Extracción de minerales metalíferos` [348] · `Extracción de minerales no metalíferos y rocas de aplicación` [348] · `Extracción de minerales para la fabricación de productos químicos` [348] · `Extracción de petróleo crudo y gas natural y servicios de apoyo` [348] · `Extracción de piedra caliza y yeso` [348] · `Extracción de rocas ornamentales` [348] · `Extracción de sal` [348] · `Extracción y aglomeración de carbón, de turba y explotación de minas y canteras n.c.p.` [348] · `Gas natural` [464] · `Gas natural convencional` [116] · `Gas natural no convencional` [116] · `Granito` [348] · `Minerales de boro (incluye tinkal, ulexita, hidroboracita, colemanita y otros minerales de boro)` [348] · `Nivel General - IPI Minero` [812] · `Petróleo crudo` [464] · `Petróleo crudo convencional` [116] · `Petróleo crudo no convencional` [116] · `Piedra laja` [348] · `Plata y oro y sus concentrados` [348] · `Puzolana, feldespato potásico (microclino, ortosa) y feldespato sódico (albita)` [348] · `Resto ( incluye hierro, cobre, plomo, cinc, molibdeno y otros minerales metalíferos no ferrosos y sus concentrados)` [348] · `Resto ( incluye roca o piedra caliza para construcción, dolomita para la producción de cal y cemento y áridos sin clasificar)` [348] · `Resto (incluye carbón térmico, ágata, cristal de roca, rodocrosita, abrasivos naturales, talco, mica en láminas u hojas y baritina -incluye …` [348] · `Resto (incluye mármol, travertino, areniscas y pórfido en bochones o escallas, bloques o aserrado en placas cuadradas o rectangulares y roca…` [348] · `Resto (incluye sulfato de sodio natural, serpentinita para uso industrial y piedra caliza para uso industrial)` [348] · `Roca o piedra caliza, conchilla y piedras o rocas calcáreas para la producción de cal y/o cemento` [348] · `Rocas para triturados pétreos sin clasificar` [348] · `Sal refinada, sal yodada y/o fluorada o sal de mesa y sal industrial o desnaturalizada` [348] · `Salmuera o solución saturada de sal` [348] · `Servicios de apoyo para la extracción de petróleo crudo y gas natural` [348] · `Suelo seleccionado y/o estabilizado para relleno` [348] · `Turba` [348] · `Yeso` [348] · `Zeolita natural (no sintetizado) y limo arcilloso para ladrillos y cerámicas rojas` [348]

**`tipo_de_indicador`** (dimension, 5 valores):

`Índice` [5.684] · `Unidades físicas` [812] · `Variación acumulada interanual` [5.452] · `Variación interanual` [5.452] · `Variación intermensual` [232]

**`unidad_de_medida`** (dimension, 5 valores):

`%` [11.136] · `miles de m³` [348] · `millones de m³` [348] · `Número índice` [5.684] · `toneladas` [116]

**`valor_null`** (signo, 3 valores):

`///` [1.132] · `∅` [15.989] · `s` [511]

## IPC — Índice de precios al consumidor — `/ipc_nacional`

Filas totales: 234.198 · períodos 201604 → 202609 · muestra: solo el período más reciente (periodo = 202609) (2.048 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `clasificador` | dimension | 4 | 2.048 |
| `nivel` | dimension | 6 | 2.048 |
| `codigo` | dimension | 109 | 2.048 |
| `descripcion` | dimension | 109 | 2.048 |
| `periodo` | periodo | — | 2.048 |
| `anio` | periodo | — | 2.048 |
| `mes` | periodo | — | 2.048 |
| `indicador` | dimension | 1 | 2.048 |
| `tipo_de_indicador` | dimension | 8 | 2.048 |
| `tipo_de_indicador_descripcion` | dimension | 32 | 2.048 |
| `region` | dimension | 7 | 2.048 |
| `unidad_de_medida` | dimension | 4 | 2.048 |
| `valor` | valor | 1.068 | 1.997 |
| `valor_null` | signo | 2 | 51 |
| `observaciones` | observaciones | 26 | 55 |

**Combinaciones `clasificador` × `nivel`** (7):

- Bienes y servicios · Categoría — 98 filas
- COICOP Argentina 2019 · Clase — 288 filas
- COICOP Argentina 2019 · División — 588 filas
- COICOP Argentina 2019 · Grupo — 770 filas
- COICOP Argentina 2019 · Producto — 129 filas
- Estacional, Núcleo y Regulados · Categoría — 147 filas
- IPC · Nivel General — 28 filas

**Combinaciones `tipo_de_indicador` × `tipo_de_indicador_descripcion`** (32):

- Incidencia_acum · Incidencia en la variación acumulada del nivel general de la region desde diciembre del año anterior — 229 filas
- Incidencia_ia · Incidencia en la variación del nivel general de la region respecto del mismo período del año anterior — 229 filas
- Incidencia_m · Incidencia en la variación del nivel general de la region del período — 229 filas
- Indice · Nivel del período, base Diciembre 2016 = 100 — 308 filas
- Precio promedio · Valor por 1,5 litros — 7 filas
- Precio promedio · Valor por 1.000 cc — 6 filas
- Precio promedio · Valor por 8 porciones — 1 filas
- Precio promedio · Valor por 10 u — 1 filas
- Precio promedio · Valor por 100 g — 1 filas
- Precio promedio · Valor por 125 g — 6 filas
- Precio promedio · Valor por 150 cc — 1 filas
- Precio promedio · Valor por 150 g — 1 filas
- Precio promedio · Valor por 195 cc — 1 filas
- Precio promedio · Valor por 200 g — 2 filas
- Precio promedio · Valor por 250 g — 1 filas
- Precio promedio · Valor por 390 g — 1 filas
- Precio promedio · Valor por 400 cc — 1 filas
- Precio promedio · Valor por 400 g — 1 filas
- Precio promedio · Valor por 500 g — 9 filas
- Precio promedio · Valor por 750 cc — 6 filas
- Precio promedio · Valor por 800 g — 2 filas
- Precio promedio · Valor por Bot. 1,5 litros — 1 filas
- Precio promedio · Valor por Docena — 6 filas
- Precio promedio · Valor por Env. 4 u — 1 filas
- Precio promedio · Valor por Env. 6 u — 1 filas
- Precio promedio · Valor por kg — 62 filas
- Precio promedio · Valor por Lata 220 g — 1 filas
- Precio promedio · Valor por Lata 230 g — 1 filas
- Precio promedio · Valor por Litro — 8 filas
- v_acum · Variación porcentual acumulada desde diciembre del año anterior — 308 filas
- v_ia · Variación porcentual respecto del mismo período del año anterior — 308 filas
- v_m · Variación porcentual respecto del período anterior — 308 filas

**`clasificador`** (dimension, 4 valores):

`Bienes y servicios` [98] · `COICOP Argentina 2019` [1.775] · `Estacional, Núcleo y Regulados` [147] · `IPC` [28]

**`nivel`** (dimension, 6 valores):

`Categoría` [245] · `Clase` [288] · `División` [588] · `Grupo` [770] · `Nivel General` [28] · `Producto` [129]

**`codigo`** (dimension, 109 valores):

`0` [28] · `01` [49] · `01.1` [42] · `01.1.1` [24] · `01.1.1.1.03` [1] · `01.1.1.1.05` [6] · `01.1.1.2.04` [1] · `01.1.1.2.05` [1] · `01.1.1.3.01` [6] · `01.1.1.3.11` [6] · `01.1.1.4.04` [6] · `01.1.2` [24] · `01.1.2.1.02` [1] · `01.1.2.1.08` [6] · `01.1.2.1.10` [1] · `01.1.2.1.12` [1] · `01.1.2.1.17` [1] · `01.1.2.1.18` [1] · `01.1.2.2.01` [6] · `01.1.2.5.04` [1] · `01.1.2.6.02` [1] · `01.1.2.6.09` [1] · `01.1.2.6.11` [1] · `01.1.3.1.03` [1] · `01.1.4` [24] · `01.1.4.1.01` [6] · `01.1.4.1.05` [1] · `01.1.4.2.03` [1] · `01.1.4.2.06` [1] · `01.1.4.2.08` [1] · `01.1.4.3.02` [1] · `01.1.4.3.05` [1] · `01.1.4.4.01` [6] · `01.1.5` [24] · `01.1.5.1.02` [6] · `01.1.5.3.01` [1] · `01.1.6` [24] · `01.1.6.1.02` [1] · `01.1.6.1.09` [1] · `01.1.6.1.11` [1] · `01.1.6.1.13` [1] · `01.1.7` [24] · `01.1.7.1.08` [1] · `01.1.7.1.10` [1] · `01.1.7.1.17` [1] · `01.1.7.1.19` [6] · `01.1.7.1.26` [1] · `01.1.7.1.31` [1] · `01.1.7.2.04` [1] · `01.1.7.2.08` [1] · `01.1.8` [24] · `01.1.8.1.01` [6] · `01.1.9.1.01` [1] · `01.1.9.3.06` [1] · `01.2` [42] · `01.2.1` [24] · `01.2.1.1.02` [1] · `01.2.1.1.12` [1] · `01.2.2` [24] · `01.2.2.1.01` [1] · `01.2.2.1.04` [1] · `02` [49] · `02.1` [42] · `02.1.2.1.01` [1] · `02.1.3.1.01` [1] · `02.2` [42] · `03` [49] · `03.1` [42] · `03.2` [42] · `04` [49] · `04.1` [42] · `04.1.1` [24] · `04.3` [7] · `04.5` [42] · `05` [49] · `05.6` [42] · `05.6.1.1.08` [6] · `05.6.1.1.10` [1] · `05.6.1.1.11` [1] · `05.6.1.1.12` [6]
… y 29 valores más.

**`descripcion`** (dimension, 109 valores):

`Aceite de girasol` [6] · `Aceites, grasas y manteca` [24] · `Adquisición de vehículos` [42] · `Agua sin gas` [1] · `Aguas minerales, bebidas gaseosas y jugos` [24] · `Algodón` [1] · `Alimentos` [42] · `Alimentos y bebidas no alcohólicas` [49] · `Alquiler de la vivienda` [24] · `Alquiler de la vivienda y gastos conexos` [42] · `Arroz blanco simple` [6] · `Arvejas secas remojadas` [1] · `Asado` [1] · `Azúcar` [6] · `Azúcar, dulces, chocolate, golosinas, etc.` [24] · `Banana` [1] · `Batata` [1] · `Bebidas alcohólicas` [42] · `Bebidas alcohólicas y tabaco` [49] · `Bebidas no alcohólicas` [42] · `Bienes` [49] · `Bienes y servicios para la conservación del hogar` [42] · `Bienes y servicios varios` [49] · `Café molido` [1] · `Café, té, yerba y cacao` [24] · `Calzado` [42] · `Carne picada común` [6] · `Carnes y derivados` [24] · `Cebolla` [1] · `Cerveza en botella` [1] · `Champú` [1] · `Combustibles y lubricantes para vehículos de uso del hogar` [24] · `Comunicación` [49] · `Cuadril` [1] · `Cuidado personal` [42] · `Desodorante` [1] · `Detergente líquido` [6] · `Dulce de leche` [1] · `Educación` [49] · `Electricidad, gas y otros combustibles` [42] · `Equipamiento y mantenimiento del hogar` [49] · `Equipos audiovisuales, fotográficos y de procesamiento de la información` [7] · `Estacional` [49] · `Fideos secos tipo guisero` [6] · `Filet de merluza fresco` [1] · `Frutas` [24] · `Funcionamiento de equipos de transporte personal` [42] · `Galletitas de agua envasadas` [1] · `Galletitas dulces envasadas sin relleno` [1] · `Gaseosa base cola` [1] · `Gastos de prepagas` [24] · `Hamburguesas congeladas` [1] · `Harina de trigo común` [6] · `Huevos de gallina` [6] · `Jabón de tocador` [6] · `Jabón en pan` [1] · `Jabón en polvo para ropa` [1] · `Jamón cocido` [1] · `Lavandina` [6] · `Leche en polvo entera` [1] · `Leche fresca entera sachet` [6] · `Leche, productos lácteos y huevos` [24] · `Lechuga` [1] · `Limón` [1] · `Manteca` [1] · `Mantenimiento y reparación de la vivienda` [7] · `Manzana deliciosa` [1] · `Nalga` [1] · `Naranja` [1] · `Nivel general` [28] · `Núcleo` [49] · `Paleta` [1] · `Pan de mesa` [1] · `Pan francés` [6] · `Pan y cereales` [24] · `Pañales descartables` [1] · `Papa` [6] · `Periódicos, diarios, revistas, libros y artículos de papelería` [42] · `Pollo entero` [6] · `Polvo para flan` [1]
… y 29 valores más.

**`indicador`** (dimension, 1 valores):

`IPC base Dic16=100` [2.048]

**`tipo_de_indicador`** (dimension, 8 valores):

`Incidencia_acum` [229] · `Incidencia_ia` [229] · `Incidencia_m` [229] · `Indice` [308] · `Precio promedio` [129] · `v_acum` [308] · `v_ia` [308] · `v_m` [308]

**`tipo_de_indicador_descripcion`** (dimension, 32 valores):

`Incidencia en la variación acumulada del nivel general de la region desde diciembre del año anterior` [229] · `Incidencia en la variación del nivel general de la region del período` [229] · `Incidencia en la variación del nivel general de la region respecto del mismo período del año anterior` [229] · `Nivel del período, base Diciembre 2016 = 100` [308] · `Valor por 1,5 litros` [7] · `Valor por 1.000 cc` [6] · `Valor por 8 porciones` [1] · `Valor por 10 u` [1] · `Valor por 100 g` [1] · `Valor por 125 g` [6] · `Valor por 150 cc` [1] · `Valor por 150 g` [1] · `Valor por 195 cc` [1] · `Valor por 200 g` [2] · `Valor por 250 g` [1] · `Valor por 390 g` [1] · `Valor por 400 cc` [1] · `Valor por 400 g` [1] · `Valor por 500 g` [9] · `Valor por 750 cc` [6] · `Valor por 800 g` [2] · `Valor por Bot. 1,5 litros` [1] · `Valor por Docena` [6] · `Valor por Env. 4 u` [1] · `Valor por Env. 6 u` [1] · `Valor por kg` [62] · `Valor por Lata 220 g` [1] · `Valor por Lata 230 g` [1] · `Valor por Litro` [8] · `Variación porcentual acumulada desde diciembre del año anterior` [308] · `Variación porcentual respecto del mismo período del año anterior` [308] · `Variación porcentual respecto del período anterior` [308]

**`region`** (dimension, 7 valores):

`Cuyo` [311] · `GBA` [370] · `Nacional` [123] · `Noreste` [311] · `Noroeste` [311] · `Pampeana` [311] · `Patagonia` [311]

**`unidad_de_medida`** (dimension, 4 valores):

`Pesos argentinos` [129] · `Porcentaje` [924] · `Puntos porcentuales` [687] · `Unidad` [308]

**`valor_null`** (signo, 2 valores):

`///` [51] · `∅` [1.997]

**`observaciones`** (observaciones, 26 valores):

`∅` [1.993] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.1.1.03-Pan blanco en rebanadas envasado` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.1.1.05-Pan tipo francés fresco en piezas (m…` [6] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.1.2.05-Galletitas dulces envasadas` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.1.3.01-Arroz blanco (simple y doble)` [6] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.1.3.11-Harina de trigo (comun, refinada, le…` [6] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.1.4.04-Fideos secos largos y cortos` [6] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.2.1.08-Carne picada (común, especial)` [6] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.2.1.12-Hamburguesas de carne fresca y conge…` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.2.5.04-Salchicha tipo viena con y sin piel` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.3.1.03-Merluza` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.4.1.01-Leche refrigerada entera` [6] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.4.1.05-Leche en polvo entera o descremada` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.4.2.03-Queso doble crema, cuartirolo` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.4.2.06-Queso pategrás, mar del plata` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.4.2.08-Queso para rallar (regianito, sardo)` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.4.3.02-Yogur entero` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.6.1.02-Banana, plátanos` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.6.1.11-Manzana (deliciosa,verde)` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.7.1.31-Zapallo (anco, redondo)` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.7.2.04-Arvejas en conserva` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.7.2.08-Tomates en conserva` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.1.9.3.06-Polvos para postres y helados (gelat…` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.2.1.1.02-Café molido o en grano` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.2.2.1.01-Agua mineral (con y sin gas)` [1] · `Esta Variedad está comprendida dentro del Producto cuyo código de COICOP Argentina 2019 es  01.2.2.1.04-Gaseosa` [1]

## Canasta básica alimentaria y total (GBA) — `/valorizacion_canastas_cba_cbt`

Filas totales: 1.638 · períodos 201604 → 202609 · muestra: tabla completa (1.638 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `clasificador` | dimension | 1 | 1.638 |
| `nivel` | dimension | 2 | 1.638 |
| `codigo` | dimension | 9 | 1.638 |
| `descripcion` | dimension | 9 | 1.638 |
| `periodo` | periodo | — | 1.638 |
| `anio` | periodo | — | 1.638 |
| `mes` | periodo | — | 1.638 |
| `indicador` | dimension | 1 | 1.638 |
| `tipo_de_indicador` | dimension | 8 | 1.638 |
| `tipo_de_indicador_descripcion` | dimension | 7 | 1.638 |
| `region` | dimension | 1 | 1.638 |
| `unidad_de_medida` | dimension | 3 | 1.638 |
| `valor` | valor | 1.334 | 1.612 |
| `valor_null` | signo | 2 | 26 |
| `observaciones` | observaciones | 1 | 0 |

**Combinaciones `nivel` × `codigo` × `tipo_de_indicador` × `descripcion`** (13):

- Adulto equivalente · CBA · CBA · Canasta Basica Alimentaria — 126 filas
- Adulto equivalente · CBA · v_ia · Canasta Basica Alimentaria — 126 filas
- Adulto equivalente · CBA · v_m · Canasta Basica Alimentaria — 126 filas
- Adulto equivalente · CBT · CBT · Canasta Basica Total — 126 filas
- Adulto equivalente · CBT · v_ia · Canasta Basica Total — 126 filas
- Adulto equivalente · CBT · v_m · Canasta Basica Total — 126 filas
- Adulto equivalente · ICE · ICE · Inversa del coeficiente de Engel — 126 filas
- Hogar · CBA H1 · Hogar 1 · Canasta Basica Alimentaria, Hogar 1 — 126 filas
- Hogar · CBA H2 · Hogar 2 · Canasta Basica Alimentaria, Hogar 2 — 126 filas
- Hogar · CBA H3 · Hogar 3 · Canasta Basica Alimentaria, Hogar 3 — 126 filas
- Hogar · CBT H1 · Hogar 1 · Canasta Basica Total, Hogar 1 — 126 filas
- Hogar · CBT H2 · Hogar 2 · Canasta Basica Total, Hogar 2 — 126 filas
- Hogar · CBT H3 · Hogar 3 · Canasta Basica Total, Hogar 3 — 126 filas

**`clasificador`** (dimension, 1 valores):

`CBA y CBT` [1.638]

**`nivel`** (dimension, 2 valores):

`Adulto equivalente` [882] · `Hogar` [756]

**`codigo`** (dimension, 9 valores):

`CBA` [378] · `CBA H1` [126] · `CBA H2` [126] · `CBA H3` [126] · `CBT` [378] · `CBT H1` [126] · `CBT H2` [126] · `CBT H3` [126] · `ICE` [126]

**`descripcion`** (dimension, 9 valores):

`Canasta Basica Alimentaria` [378] · `Canasta Basica Alimentaria, Hogar 1` [126] · `Canasta Basica Alimentaria, Hogar 2` [126] · `Canasta Basica Alimentaria, Hogar 3` [126] · `Canasta Basica Total` [378] · `Canasta Basica Total, Hogar 1` [126] · `Canasta Basica Total, Hogar 2` [126] · `Canasta Basica Total, Hogar 3` [126] · `Inversa del coeficiente de Engel` [126]

**`indicador`** (dimension, 1 valores):

`Canasta` [1.638]

**`tipo_de_indicador`** (dimension, 8 valores):

`CBA` [126] · `CBT` [126] · `Hogar 1` [252] · `Hogar 2` [252] · `Hogar 3` [252] · `ICE` [126] · `v_ia` [252] · `v_m` [252]

**`tipo_de_indicador_descripcion`** (dimension, 7 valores):

`Proporcion de gastos totales sobre gastos alimentarios` [126] · `Valores mensuales del Hogar de cinco integrantes, constituido por una pareja de un varón y una mujer, ambos de 30 años, y tres hijos de 5, 3…` [252] · `Valores mensuales del Hogar de cuatro integrantes, compuesto por un varón de 35 años, una mujer de 31 años, un hijo de 6 años y una hija de …` [252] · `Valores mensuales del Hogar de tres integrantes, compuesto por una mujer de 35 años, su hijo de 18 años y su madre de 61 años, expresados en…` [252] · `Valores mensuales por adulto equivalente, expresados en pesos` [252] · `Variación porcentual respecto del mismo período del año anterior` [252] · `Variación porcentual respecto del período anterior` [252]

**`region`** (dimension, 1 valores):

`GBA` [1.638]

**`unidad_de_medida`** (dimension, 3 valores):

`Pesos argentinos` [1.008] · `Porcentaje` [504] · `Unidad` [126]

**`valor_null`** (signo, 2 valores):

`///` [26] · `∅` [1.612]

**`observaciones`** (observaciones, 1 valores):

`∅` [1.638]

## Índice de salarios — `/indice_salarios`

Filas totales: 3.406 · períodos 201510 → 202608 · muestra: tabla completa (3.406 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `clasificador` | dimension | 1 | 3.406 |
| `nivel` | dimension | 4 | 3.406 |
| `codigo` | dimension | 7 | 3.406 |
| `descripcion` | dimension | 7 | 3.406 |
| `periodo` | periodo | — | 3.406 |
| `anio` | periodo | — | 3.406 |
| `mes` | periodo | — | 3.406 |
| `indicador` | dimension | 1 | 3.406 |
| `tipo_de_indicador` | dimension | 4 | 3.406 |
| `tipo_de_indicador_descripcion` | dimension | 4 | 3.406 |
| `unidad_de_medida` | dimension | 2 | 3.406 |
| `valor` | valor | 2.223 | 2.758 |
| `valor_null` | signo | 2 | 648 |
| `observaciones` | observaciones | 1 | 0 |

**Combinaciones `nivel` × `codigo` × `descripcion`** (7):

- 0 · 0 · Nivel general — 524 filas
- 1 · 100 · Total registrado — 524 filas
- 1 · 200 · Total no registrado — 524 filas
- 2 · 110 · Sector privado registrado — 524 filas
- 2 · 120 · Sector público — 524 filas
- 3 · 121 · Subsector público nacional — 393 filas
- 3 · 122 · Subsector público provincial — 393 filas

**Combinaciones `tipo_de_indicador` × `tipo_de_indicador_descripcion`** (4):

- Indice · Nivel del período, base octubre 2016=100 — 655 filas
- v_acum · Variación porcentual acumulada desde diciembre del año anterior — 917 filas
- v_ia · Variación porcentual respecto del mismo período del año anterior — 917 filas
- v_m · Variación porcentual respecto del período anterior — 917 filas

**`clasificador`** (dimension, 1 valores):

`IS 2001` [3.406]

**`nivel`** (dimension, 4 valores):

`0` [524] · `1` [1.048] · `2` [1.048] · `3` [786]

**`codigo`** (dimension, 7 valores):

`0` [524] · `100` [524] · `110` [524] · `120` [524] · `121` [393] · `122` [393] · `200` [524]

**`descripcion`** (dimension, 7 valores):

`Nivel general` [524] · `Sector privado registrado` [524] · `Sector público` [524] · `Subsector público nacional` [393] · `Subsector público provincial` [393] · `Total no registrado` [524] · `Total registrado` [524]

**`indicador`** (dimension, 1 valores):

`Índice de salarios (IS)` [3.406]

**`tipo_de_indicador`** (dimension, 4 valores):

`Indice` [655] · `v_acum` [917] · `v_ia` [917] · `v_m` [917]

**`tipo_de_indicador_descripcion`** (dimension, 4 valores):

`Nivel del período, base octubre 2016=100` [655] · `Variación porcentual acumulada desde diciembre del año anterior` [917] · `Variación porcentual respecto del mismo período del año anterior` [917] · `Variación porcentual respecto del período anterior` [917]

**`unidad_de_medida`** (dimension, 2 valores):

`Porcentaje` [2.751] · `Unidad` [655]

**`valor_null`** (signo, 2 valores):

`///` [648] · `∅` [2.758]

**`observaciones`** (observaciones, 1 valores):

`∅` [3.406]

## Índice del costo de la construcción (GBA) — `/icc_precios_construccion`

Filas totales: 14.017 · períodos 201511 → 202609 · muestra: tabla completa (14.017 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `indicador` | dimension | 1 | 14.017 |
| `codigo_apertura` | dimension | 29 | 14.017 |
| `codigo_CPC_1` | dimension | 11 | 14.017 |
| `clasificador` | dimension | 2 | 14.017 |
| `nivel` | dimension | 5 | 14.017 |
| `descripcion` | dimension | 29 | 14.017 |
| `periodo` | periodo | — | 14.017 |
| `anio` | periodo | — | 14.017 |
| `mes` | periodo | — | 14.017 |
| `tipo_de_indicador` | dimension | 5 | 14.017 |
| `tipo_de_indicador_descripcion` | dimension | 5 | 14.017 |
| `region` | dimension | 1 | 14.017 |
| `unidad_de_medida` | dimension | 3 | 14.017 |
| `valor` | valor | 3.976 | 13.623 |
| `valor_null` | signo | 2 | 394 |
| `observaciones` | observaciones | 2 | 642 |

**Combinaciones `clasificador` × `nivel`** (5):

- ICC 93 · Capitulo — 1.965 filas
- ICC 93 · Grupo — 786 filas
- ICC 93 · Ítems — 6.812 filas
- ICC 93 · Nivel general — 524 filas
- ICC 93-CPC · Producto — 3.930 filas

**Combinaciones `tipo_de_indicador` × `tipo_de_indicador_descripcion`** (5):

- incidencia · Incidencia en la variación mensual del Nivel General — 393 filas
- Indice · Nivel del período, base 1993, ene-22=100 — 2.227 filas
- v_acum · Variación porcentual acumulada desde diciembre del año anterior — 3.799 filas
- v_ia · Variación porcentual respecto del mismo período del año anterior — 3.799 filas
- v_m · Variación porcentual respecto del período anterior — 3.799 filas

**`indicador`** (dimension, 1 valores):

`ICC` [14.017]

**`codigo_apertura`** (dimension, 29 valores):

`0` [524] · `01` [655] · `01-15310-11` [393] · `01-37350-11` [393] · `01-37440-11` [393] · `01-41242-11` [393] · `02` [655] · `02-01` [393] · `02-02` [393] · `03` [655] · `03-51800-11` [393] · `03-51800-21` [393] · `03-71233-11` [393] · `03-71240-11` [393] · `03-74110-11` [393] · `03-83107-1` [393] · `IT-01` [524] · `IT-02` [524] · `IT-03` [524] · `IT-04` [524] · `IT-05` [524] · `IT-06` [524] · `IT-07` [524] · `IT-08` [524] · `IT-09` [524] · `IT-10` [524] · `IT-11` [524] · `IT-12` [524] · `IT-13` [524]

**`codigo_CPC_1`** (dimension, 11 valores):

`-` [10.087] · `15310-11` [393] · `37350-11` [393] · `37440-11` [393] · `41242-11` [393] · `51800-11` [393] · `51800-21` [393] · `71233-11` [393] · `71240-11` [393] · `74110-11` [393] · `83107-1` [393]

**`clasificador`** (dimension, 2 valores):

`ICC 93` [10.087] · `ICC 93-CPC` [3.930]

**`nivel`** (dimension, 5 valores):

`Capitulo` [1.965] · `Grupo` [786] · `Ítems` [6.812] · `Nivel general` [524] · `Producto` [3.930]

**`descripcion`** (dimension, 29 valores):

`Acero aletado conformado, en barra` [393] · `Albañilería` [524] · `Alquiler de andamios` [393] · `Alquiler de camión volcador` [393] · `Alquiler de camioneta` [393] · `Alquiler de pala cargadora` [393] · `Alquiler de retroexcavadora` [393] · `Alquiler de volquete` [393] · `Arena fina` [393] · `Ascensores` [524] · `Carpintería de madera` [524] · `Carpintería metálica y herrería` [524] · `Cemento portland normal, en bolsa` [393] · `Estructura` [524] · `Gastos generales` [655] · `Instalación de gas` [524] · `Instalación eléctrica` [524] · `Instalación sanitaria y contraincendios` [524] · `Ladrillo cerámico hueco` [393] · `Mano de obra` [655] · `Mano de obra asalariada` [393] · `Materiales` [655] · `Movimiento de tierra` [524] · `Nivel general` [524] · `Otros trabajos y gastos` [524] · `Pintura` [524] · `Subcontratos de mano de obra` [393] · `Vidrios` [524] · `Yesería` [524]

**`tipo_de_indicador`** (dimension, 5 valores):

`incidencia` [393] · `Indice` [2.227] · `v_acum` [3.799] · `v_ia` [3.799] · `v_m` [3.799]

**`tipo_de_indicador_descripcion`** (dimension, 5 valores):

`Incidencia en la variación mensual del Nivel General` [393] · `Nivel del período, base 1993, ene-22=100` [2.227] · `Variación porcentual acumulada desde diciembre del año anterior` [3.799] · `Variación porcentual respecto del mismo período del año anterior` [3.799] · `Variación porcentual respecto del período anterior` [3.799]

**`region`** (dimension, 1 valores):

`GBA` [14.017]

**`unidad_de_medida`** (dimension, 3 valores):

`Porcentaje` [11.397] · `Puntos porcentuales` [393] · `Unidad` [2.227]

**`valor_null`** (signo, 2 valores):

`///` [394] · `∅` [13.623]

**`observaciones`** (observaciones, 2 valores):

`* Dato provisorio` [642] · `∅` [13.375]

## Sistema de índices de precios mayoristas (IPIM, IPIB, IPP) — `/sipm_precios_mayoristas`

Filas totales: 234.260 · períodos 201512 → 202609 · muestra: solo el período más reciente (periodo = 202609) (1.802 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `operativo` | dimension | 1 | 1.802 |
| `indicador` | dimension | 3 | 1.802 |
| `clasificador` | dimension | 2 | 1.802 |
| `nivel` | dimension | 7 | 1.802 |
| `codigo_apertura` | dimension | 142 | 1.802 |
| `descripcion` | dimension | 135 | 1.802 |
| `periodo` | periodo | — | 1.802 |
| `anio` | periodo | — | 1.802 |
| `mes` | periodo | — | 1.802 |
| `tipo_de_indicador` | dimension | 5 | 1.802 |
| `tipo_de_indicador_descripcion` | dimension | 5 | 1.802 |
| `region` | dimension | 1 | 1.802 |
| `unidad_de_medida` | dimension | 3 | 1.802 |
| `valor` | valor | 637 | 1.802 |
| `valor_null` | signo | 1 | 0 |
| `observaciones` | observaciones | 1 | 1.802 |

**Combinaciones `indicador` × `clasificador` × `nivel`** (24):

- IPIB · CIIU3 · Categoría de Tabulación — 25 filas
- IPIB · CIIU3 · Clase — 252 filas
- IPIB · CIIU3 · División — 130 filas
- IPIB · CIIU3 · Grupo — 168 filas
- IPIB · CIIU3 · Sector — 5 filas
- IPIB · SIPM 93 · Nivel general — 4 filas
- IPIB · SIPM 93 · Origen — 10 filas
- IPIB · SIPM 93 · Sector — 10 filas
- IPIM · CIIU3 · Categoría de Tabulación — 25 filas
- IPIM · CIIU3 · Clase — 252 filas
- IPIM · CIIU3 · División — 130 filas
- IPIM · CIIU3 · Grupo — 168 filas
- IPIM · CIIU3 · Sector — 5 filas
- IPIM · SIPM 93 · Nivel general — 4 filas
- IPIM · SIPM 93 · Origen — 10 filas
- IPIM · SIPM 93 · Sector — 10 filas
- IPP · CIIU3 · Categoría de Tabulación — 25 filas
- IPP · CIIU3 · Clase — 252 filas
- IPP · CIIU3 · División — 130 filas
- IPP · CIIU3 · Grupo — 168 filas
- IPP · CIIU3 · Sector — 5 filas
- IPP · SIPM 93 · Nivel general — 4 filas
- IPP · SIPM 93 · Origen — 5 filas
- IPP · SIPM 93 · Sector — 5 filas

**Combinaciones `tipo_de_indicador` × `tipo_de_indicador_descripcion`** (5):

- incidencia · Incidencia en la variación porcentual mensual del nivel general — 106 filas
- Indice · Nivel del período, base 1993, dic-15=100 — 424 filas
- v_acum · Variación porcentual acumulada desde diciembre del año anterior — 424 filas
- v_ia · Variación porcentual respecto del mismo período del año anterior — 424 filas
- v_m · Variación porcentual respecto del período anterior — 424 filas

**`operativo`** (dimension, 1 valores):

`SIPM` [1.802]

**`indicador`** (dimension, 3 valores):

`IPIB` [604] · `IPIM` [604] · `IPP` [594]

**`clasificador`** (dimension, 2 valores):

`CIIU3` [1.740] · `SIPM 93` [62]

**`nivel`** (dimension, 7 valores):

`Categoría de Tabulación` [75] · `Clase` [756] · `División` [390] · `Grupo` [504] · `Nivel general` [12] · `Origen` [25] · `Sector` [40]

**`codigo_apertura`** (dimension, 142 valores):

`01` [15] · `1` [15] · `2` [15] · `3` [10] · `05` [15] · `11` [15] · `011` [12] · `012` [12] · `14` [15] · `15` [15] · `16` [15] · `17` [15] · `18` [15] · `19` [15] · `20` [15] · `21` [15] · `22` [15] · `23` [15] · `24` [15] · `25` [15] · `26` [15] · `27` [15] · `28` [15] · `29` [15] · `31` [15] · `32` [15] · `33` [15] · `34` [15] · `35` [15] · `36` [15] · `40` [15] · `0111` [12] · `0112` [12] · `0113` [12] · `0121` [12] · `0122` [12] · `151` [12] · `152` [12] · `153` [12] · `154` [12] · `155` [12] · `171` [12] · `172` [12] · `173` [12] · `191` [12] · `192` [12] · `201` [12] · `202` [12] · `221` [12] · `222` [12] · `241` [12] · `242` [12] · `243` [12] · `251` [12] · `252` [12] · `261` [12] · `269` [12] · `271` [12] · `272` [12] · `273` [12] · `281` [12] · `289` [12] · `291` [12] · `292` [12] · `293` [12] · `311` [12] · `312` [12] · `313` [12] · `314` [12] · `315` [12] · `319` [12] · `341` [12] · `342` [12] · `343` [12] · `361` [12] · `369` [12] · `1511` [12] · `1512` [12] · `1513` [12] · `1514` [12]
… y 62 valores más.

**`descripcion`** (dimension, 135 valores):

`Abonos y fertilizantes` [12] · `Aceites y grasas vegetales` [12] · `Acumuladores eléctricos` [12] · `Agrícolas` [12] · `Alcohol etílico y bebidas` [12] · `Alcohol etílico y bebidas alcohólicas destiladas` [12] · `Alimentos balanceados` [12] · `Alimentos y bebidas` [15] · `Aparatos de distribución y control eléctrico` [12] · `Armas y municiones` [12] · `Artículos de hormigón, de cemento y de yeso` [12] · `Artículos de librería` [12] · `Azúcar` [12] · `Bebidas no alcohólicas` [12] · `Bombas y compresores` [12] · `Calzado` [12] · `Carpintería de madera` [12] · `Carrocerías y remolques` [12] · `Cemento y cal` [12] · `Cereales y oleaginosas` [12] · `Cervezas` [12] · `Conductores eléctricos` [12] · `Conservas de frutas, hortalizas y legumbres` [12] · `Conservas de pescados` [12] · `Cubiertas de caucho` [12] · `Cuero, artículos de marroquinería y calzado` [15] · `Cueros curtidos` [12] · `Cueros, valijas y artículos de marroquinería` [12] · `Diarios y revistas` [12] · `Energía eléctrica` [30] · `Envases de papel y cartón` [12] · `Equipos de elevación y manipulación` [12] · `Equipos de iluminación` [12] · `Equipos para medicina` [12] · `Equipos para medicina e instrumentos de medición` [15] · `Equipos y aparatos de radio y televisión` [15] · `Fibras manufacturadas` [12] · `Frutas` [12] · `Ganaderos` [12] · `Ganado porcino y productos de granja` [12] · `Ganado vacuno y leche` [12] · `Generadores de vapor` [12] · `Harinas` [12] · `Herramientas de mano y artículos de ferretería` [12] · `Hortalizas y legumbres` [12] · `Impresiones y reproducción de grabaciones` [15] · `Industria Manufacturera y Energía Eléctrica` [15] · `Insecticidas y plaguicidas` [12] · `Instrumentos de medición de servicios domiciliarios` [12] · `Jabones y detergentes` [12] · `Madera y productos de madera excepto muebles` [15] · `Maderas aserradas` [12] · `Máquinas agrícolas` [12] · `Máquinas de uso especial` [12] · `Máquinas de uso general` [12] · `Máquinas herramientas` [12] · `Máquinas para la elaboración o procesamiento de alimentos y bebidas` [12] · `Máquinas para la industria extractiva y obras de construcción` [12] · `Máquinas para lavaderos industriales` [12] · `Máquinas y aparatos eléctricos` [15] · `Máquinas y equipos` [15] · `Materias primas textiles` [12] · `Motocicletas` [12] · `Motores a explosión excepto para automotores` [12] · `Motores, generadores y transformadores eléctricos` [12] · `Muebles y colchones` [12] · `Muebles y otros productos industriales` [15] · `Nivel general` [12] · `Otra maquinaria de uso general` [12] · `Otros aparatos de uso doméstico` [12] · `Otros artículos de minerales no metalíferos n.c.e.p.` [12] · `Otros artículos de papel y cartón` [12] · `Otros equipos eléctricos` [12] · `Otros medios de transporte` [27] · `Otros productos alimenticios` [12] · `Otros productos alimenticios n.c.e.p.` [12] · `Otros productos de caucho` [12] · `Otros productos de minerales no metálicos` [12] · `Otros productos manufacturados` [12] · `Otros productos metálicos excepto máquinas, equipos y muebles` [12]
… y 55 valores más.

**`tipo_de_indicador`** (dimension, 5 valores):

`incidencia` [106] · `Indice` [424] · `v_acum` [424] · `v_ia` [424] · `v_m` [424]

**`tipo_de_indicador_descripcion`** (dimension, 5 valores):

`Incidencia en la variación porcentual mensual del nivel general` [106] · `Nivel del período, base 1993, dic-15=100` [424] · `Variación porcentual acumulada desde diciembre del año anterior` [424] · `Variación porcentual respecto del mismo período del año anterior` [424] · `Variación porcentual respecto del período anterior` [424]

**`region`** (dimension, 1 valores):

`Total del país` [1.802]

**`unidad_de_medida`** (dimension, 3 valores):

`Porcentaje` [1.272] · `Puntos porcentuales` [106] · `Unidad` [424]

**`valor_null`** (signo, 1 valores):

`∅` [1.802]

**`observaciones`** (observaciones, 1 valores):

`* Dato provisorio` [1.802]

## EPH — Principales tasas del mercado de trabajo — `/mercado_trabajo_eph`

Filas totales: 41 · períodos 20162T → 20262T · muestra: tabla completa (41 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `area_geografica_nom` | dimension | 1 | 41 |
| `area_geografica_cod` | dimension | 1 | 0 |
| `area_geografica_cod_null` | signo | 1 | 0 |
| `periodo` | periodo | — | 41 |
| `anio` | periodo | — | 41 |
| `trimestre` | periodo | — | 41 |
| `tasa_de_actividad` | valor | 27 | 41 |
| `tasa_de_actividad_null` | signo | 1 | 0 |
| `tasa_de_empleo` | valor | 29 | 41 |
| `tasa_de_empleo_null` | signo | 1 | 0 |
| `tasa_de_empleo_formal` | valor | 11 | 11 |
| `tasa_de_empleo_formal_null` | signo | 1 | 0 |
| `tasa_de_empleo_informal` | valor | 11 | 11 |
| `tasa_de_empleo_informal_null` | signo | 1 | 0 |
| `tasa_de_desocupacion` | valor | 32 | 41 |
| `tasa_de_desocupacion_null` | signo | 1 | 0 |
| `tasa_de_ocupacion_demandante` | valor | 31 | 41 |
| `tasa_de_ocupacion_demandante_null` | signo | 1 | 0 |
| `tasa_de_subocupacion` | valor | 29 | 41 |
| `tasa_de_subocupacion_null` | signo | 1 | 0 |
| `tasa_de_subocupacion_demandante` | valor | 26 | 41 |
| `tasa_de_subocupacion_demandante_null` | signo | 1 | 0 |
| `tasa_de_subocupacion_no_demandante` | valor | 14 | 41 |
| `tasa_de_subocupacion_no_demandante_null` | signo | 1 | 0 |
| `observaciones` | observaciones | 5 | 4 |
| `observaciones_null` | signo | 1 | 0 |

**`area_geografica_nom`** (dimension, 1 valores):

`T_31_A` [41]

**`area_geografica_cod`** (dimension, 1 valores):

`∅` [41]

**`area_geografica_cod_null`** (signo, 1 valores):

`∅` [41]

**`tasa_de_actividad_null`** (signo, 1 valores):

`∅` [41]

**`tasa_de_empleo_null`** (signo, 1 valores):

`∅` [41]

**`tasa_de_empleo_formal_null`** (signo, 1 valores):

`∅` [41]

**`tasa_de_empleo_informal_null`** (signo, 1 valores):

`∅` [41]

**`tasa_de_desocupacion_null`** (signo, 1 valores):

`∅` [41]

**`tasa_de_ocupacion_demandante_null`** (signo, 1 valores):

`∅` [41]

**`tasa_de_subocupacion_null`** (signo, 1 valores):

`∅` [41]

**`tasa_de_subocupacion_demandante_null`** (signo, 1 valores):

`∅` [41]

**`tasa_de_subocupacion_no_demandante_null`** (signo, 1 valores):

`∅` [41]

**`observaciones`** (observaciones, 5 valores):

`∅` [37] · `Dato provisorio` [1] · `La información respecto a la condición de formalidad en el emplo se encuentra disponible a partir del cuarto trimestre de 2023.` [1] · `Los resultados del tercer trimestre de 2019 no incluyen el aglomerado Gran Resistencia.` [1] · `Los resultados del tercer trimestre de 2020 no incluyen el aglomerado Ushuaia-Rio Grande` [1]

**`observaciones_null`** (signo, 1 valores):

`∅` [41]

## EPH — Pobreza e indigencia — `/pobreza_eph`

Filas totales: 20 · períodos 20162S → 20261S · muestra: tabla completa (20 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `area_geografica_nom` | dimension | 1 | 20 |
| `area_geografica_cod` | dimension | 1 | 0 |
| `area_geografica_cod_null` | signo | 1 | 0 |
| `periodo` | periodo | — | 20 |
| `anio` | periodo | — | 20 |
| `semestre` | periodo | — | 20 |
| `tasa_pobreza_hogares` | valor | 19 | 20 |
| `tasa_pobreza_hogares_null` | signo | 1 | 0 |
| `tasa_pobreza_personas` | valor | 20 | 20 |
| `tasa_pobreza_personas_null` | signo | 1 | 0 |
| `tasa_indigencia_hogares` | valor | 16 | 20 |
| `tasa_indigencia_hogares_null` | signo | 1 | 0 |
| `tasa_indigencia_personas` | valor | 18 | 20 |
| `tasa_indigencia_personas_null` | signo | 1 | 0 |
| `observaciones` | observaciones | 4 | 3 |
| `observaciones_null` | signo | 1 | 0 |

**`area_geografica_nom`** (dimension, 1 valores):

`T_31_A` [20]

**`area_geografica_cod`** (dimension, 1 valores):

`∅` [20]

**`area_geografica_cod_null`** (signo, 1 valores):

`∅` [20]

**`tasa_pobreza_hogares_null`** (signo, 1 valores):

`∅` [20]

**`tasa_pobreza_personas_null`** (signo, 1 valores):

`∅` [20]

**`tasa_indigencia_hogares_null`** (signo, 1 valores):

`∅` [20]

**`tasa_indigencia_personas_null`** (signo, 1 valores):

`∅` [20]

**`observaciones`** (observaciones, 4 valores):

`∅` [17] · `Dato provisorio` [1] · `Los resultados del segundo semestre de 2019 no incluyen el aglomerado Gran Resistencia.` [1] · `Los resultados del segundo semestre de 2020 no incluyen el aglomerado Ushuaia-Rio Grande` [1]

**`observaciones_null`** (signo, 1 valores):

`∅` [20]

## Exportaciones de bienes por rubro, subrubro y país (FOB) — `/comercio_exterior_exportacion_bienes`

Filas totales: 779.536 · períodos 198601 → 202609 · muestra: solo el período más reciente (Periodo = 202609) (1.891 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `Anio` | periodo | — | 1.891 |
| `Mes` | periodo | — | 1.891 |
| `Periodo` | periodo | — | 1.891 |
| `rubro_cod` | dimension | 5 | 1.891 |
| `subrubro_cod` | dimension | 49 | 1.891 |
| `pais_cod` | dimension | 171 | 1.891 |
| `valor_FOB` | valor | 900 | 899 |
| `valor_FOB_null` | signo | 2 | 992 |
| `Peso_Neto` | valor | 900 | 899 |
| `Peso_Neto_null` | signo | 2 | 992 |

**`rubro_cod`** (dimension, 5 valores):

`1` (PRODUCTOS PRIMARIOS) [428] · `2` (MANUFACTURAS DE ORIGEN AGROPECUARIO (MOA)) [754] · `3` (MANUFACTURAS DE ORIGEN INDUSTRIAL (MOI)) [647] · `4` (COMBUSTIBLE Y ENERGIA) [61] · `9` (CONFIDENCIAL) [1]

**`subrubro_cod`** (dimension, 49 valores):

`101` (Animales Vivos) [15] · `102` (Pescados y mariscos sin elaborar) [65] · `103` (Miel) [14] · `104` (Hortalizas y legumbres sin elaborar) [64] · `105` (Frutas frescas) [39] · `106` (Cereales) [80] · `107` (Semillas y frutos oleaginosos) [79] · `108` (Tabaco sin elaborar) [20] · `109` (Lanas sucias) [6] · `110` (Fibras de algodón) [5] · `111` (Minerales metalíferos, escorias y cenizas) [4] · `199` (Resto de productos primarios) [37] · `201` (Carnes y sus preparados) [82] · `202` (Pescados y mariscos elaborados) [29] · `203` (Productos lácteos) [57] · `204` (Otros productos de origen animal) [28] · `205` (Frutas secas o procesadas) [33] · `206` (Café, té, yerba mate y especias) [33] · `207` (Productos de molinería y sus preparaciones) [42] · `208` (Grasas y aceites) [62] · `209` (Azúcar ,cacao y artículos de confitería) [29] · `210` (Preparados de hortalizas, legumbres y frutas) [61] · `211` (Bebidas, líquidos alcohólicos y vinagre) [92] · `212` (Residuos y desperdicios de la industria alimentaria) [60] · `213` (Extractos curtientes y tintóreos) [37] · `214` (Pieles y cueros) [30] · `215` (Lanas elaboradas) [17] · `299` (Resto de MOA) [62] · `302` (Productos químicos y conexos) [100] · `303` (Materias plásticas y sus manufacturas) [54] · `304` (Caucho y sus manufacturas) [47] · `305` (Manufacturas de cuero, marroquinería, etc.) [25] · `306` (Papel, cartón, impresos y publicaciones) [44] · `307` (Textiles y confecciones) [39] · `308` (Calzado y sus partes componentes) [10] · `309` (Manufacturas de piedra, yeso, vidrio, etc.) [33] · `310` (Piedras, metales preciosos y sus manufacturas, monedas) [12] · `311` (Metales comunes y sus manufacturas) [69] · `312` (Máquinas y aparatos, material eléctrico) [87] · `313` (Material de transporte terrestre) [43] · `314` (Vehículos de navegación aérea, marítima y fluvial) [9] · `399` (Resto de MOI) [75] · `401` (Petróleo crudo) [11] · `402` (Carburantes) [19] · `403` (Grasas y aceites lubricantes) [9] · `404` (Gas de petróleo y otros hidrocarburos gaseosos) [9] · `405` (Energía eléctrica) [1] · `499` (Resto de combustibles ) [12] · `999` (Confidencial) [1]

**`pais_cod`** (dimension, 171 valores):

`AE` (Emiratos Árabes Unidos) [21] · `AF` (Afganistán) [1] · `AG` (Antigua Y Barbuda) [3] · `AL` (Albania) [3] · `AM` (Armenia) [3] · `AO` (Angola) [15] · `AT` (Austria) [9] · `AU` (Australia) [23] · `AW` (Aruba) [8] · `AZ` (Azerbaiyán) [6] · `BA` (Bosnia y Herzegovina) [7] · `BB` (Barbados) [5] · `BD` (Bangladesh) [7] · `BE` (Bélgica) [22] · `BG` (Bulgaria) [12] · `BH` (Bahrein) [1] · `BJ` (Benin) [4] · `BO` (Bolivia) [35] · `BR` (Brasil) [42] · `BS` (Bahamas) [4] · `BY` (Belarús) [4] · `BZ` (Belice) [3] · `CA` (Canadá) [33] · `CD` (Rep. Democrática del Congo (ex Zaire)) [6] · `CF` (República Centroafricana) [2] · `CG` (Congo) [4] · `CH` (Suiza) [12] · `CI` (Côte d' Ivoire (Costa de Marfil)) [6] · `CL` (Chile) [41] · `CM` (Camerún) [5] · `CN` (China) [31] · `CO` (Colombia) [36] · `CR` (Costa Rica) [29] · `CU` (Cuba) [5] · `CV` (Cabo Verde) [1] · `CW` (Curazao) [7] · `CY` (Chipre) [7] · `CZ` (República Checa  ) [16] · `DE` (República Federal de Alemania) [33] · `DJ` (Djibouti) [1] · `DK` (Dinamarca) [11] · `DM` (Dominica) [1] · `DO` (República Dominicana) [25] · `DZ` (Argelia) [9] · `EC` (Ecuador) [31] · `EE` (Estonia) [4] · `EG` (Egipto) [15] · `ES` (España) [36] · `FI` (Finlandia) [9] · `FR` (Francia) [28] · `GA` (Gabón) [9] · `GB` (Reino Unido) [23] · `GD` (Granada) [3] · `GE` (Georgia) [4] · `GH` (Ghana) [9] · `GM` (Gambia) [2] · `GN` (Guinea) [4] · `GQ` (Guinea Ecuatorial) [3] · `GR` (Grecia) [15] · `GT` (Guatemala) [25] · `GW` (Guinea Bissau) [3] · `GY` (Guyana) [4] · `HK` (Hong Kong Región Administrativa Especial de (China)) [14] · `HN` (Honduras) [20] · `HR` (Croacia) [6] · `HT` (Haití) [3] · `HU` (Hungría) [11] · `ID` (Indonesia) [21] · `IE` (Irlanda) [9] · `IL` (Israel) [19] · `IN` (India) [23] · `IQ` (Iraq) [5] · `IR` (Irán) [1] · `IS` (Islandia) [2] · `IT` (Italia) [33] · `JM` (Jamaica) [8] · `JO` (Jordania) [10] · `JP` (Japón) [26] · `KE` (Kenya) [7] · `KH` (Camboya (ex Kampuchea)) [5]
… y 91 valores más.

**`valor_FOB_null`** (signo, 2 valores):

`∅` [899] · `s` [992]

**`Peso_Neto_null`** (signo, 2 valores):

`∅` [899] · `s` [992]

## Importaciones de bienes por uso económico y país (CIF) — `/comercio_exterior_importacion_bienes`

Filas totales: 390.315 · períodos 198601 → 202609 · muestra: solo el período más reciente (Periodo = 202609) (1.041 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `Anio` | periodo | — | 1.041 |
| `Mes` | periodo | — | 1.041 |
| `Periodo` | periodo | — | 1.041 |
| `uso_economico_cod` | dimension | 7 | 1.041 |
| `gce_cod` | dimension | 18 | 1.041 |
| `pais_cod` | dimension | 137 | 1.041 |
| `valor_CIF` | valor | 1.039 | 1.041 |
| `valor_CIF_null` | signo | 1 | 0 |
| `peso_neto` | valor | 1.005 | 1.041 |
| `peso_neto_null` | signo | 1 | 0 |

**`uso_economico_cod`** (dimension, 7 valores):

`1` (Bienes de Capital) [121] · `2` (Bienes Intermedios) [242] · `3` (Combustibles y Lubricantes) [45] · `4` (Piezas y Accesorios para Bienes de Capital) [181] · `5` (Bienes de Consumo) [367] · `6` (Vehiculos Automotores de Pasajeros) [21] · `9` (Resto) [64]

**`gce_cod`** (dimension, 18 valores):

`111` (Alimentos y bebidas básicos fundamentalmente para la industria) [31] · `112` (Alimentos y bebidas básicos fundalmentalmente para el hogar) [41] · `121` (Alimentos y bebidas elaborados fundalmentalmente para la industria) [38] · `122` (Alimentos y bebidas elaborados fundalmentalmente para el hogar) [58] · `210` (Suministros industiales básicos no especificados en otras partidas) [56] · `220` (Suministros industiales elaborados no especificados en otras partidas) [117] · `310` (Combustibles y lubricantes básicos) [6] · `320` (Combustibles y lubricantes elaborados) [39] · `410` (Bienes de capital excluido equipos de transporte) [91] · `420` (Piezas y accesorios para bienes de capital) [98] · `510` (Vehiculos automotores de pasajeros) [21] · `521` (Equipos de transporte industriales) [30] · `522` (Equipos de transporte no industriales) [25] · `530` (Piezas y accesorios para equipos de transporte) [83] · `610` (Artículos de consumo duraderos no especificados en otra partida ) [60] · `620` (Artículos de consumo semiduraderos no especificados en otra partida ) [95] · `630` (Artículos de consumo no duraderos no especificados en otra partida) [88] · `700` (Bienes no especificados en otras partidas) [64]

**`pais_cod`** (dimension, 137 valores):

`AE` (Emiratos Árabes Unidos) [9] · `AF` (Afganistán) [1] · `AL` (Albania) [6] · `AM` (Armenia) [3] · `AR` (Argentina) [14] · `AT` (Austria) [15] · `AU` (Australia) [14] · `AZ` (Azerbaiyán) [2] · `BA` (Bosnia y Herzegovina) [6] · `BB` (Barbados) [1] · `BD` (Bangladesh) [5] · `BE` (Bélgica) [16] · `BF` (Burkina Faso) [1] · `BG` (Bulgaria) [9] · `BH` (Bahrein) [1] · `BJ` (Benin) [3] · `BO` (Bolivia) [10] · `BR` (Brasil) [17] · `BW` (Botswana) [4] · `BY` (Belarús) [5] · `BZ` (Belice) [1] · `CA` (Canadá) [17] · `CH` (Suiza) [14] · `CI` (Côte d' Ivoire (Costa de Marfil)) [1] · `CL` (Chile) [14] · `CM` (Camerún) [1] · `CN` (China) [17] · `CO` (Colombia) [16] · `CR` (Costa Rica) [10] · `CU` (Cuba) [2] · `CY` (Chipre) [3] · `CZ` (República Checa  ) [9] · `DE` (República Federal de Alemania) [17] · `DK` (Dinamarca) [12] · `DO` (República Dominicana) [8] · `DZ` (Argelia) [4] · `EC` (Ecuador) [12] · `EE` (Estonia) [10] · `EG` (Egipto) [13] · `ER` (Eritrea) [1] · `ES` (España) [17] · `ET` (Etiopia) [3] · `FI` (Finlandia) [9] · `FR` (Francia) [16] · `GA` (Gabón) [4] · `GB` (Reino Unido) [17] · `GE` (Georgia) [4] · `GH` (Ghana) [1] · `GN` (Guinea) [1] · `GR` (Grecia) [9] · `GT` (Guatemala) [9] · `HK` (Hong Kong Región Administrativa Especial de (China)) [8] · `HN` (Honduras) [5] · `HR` (Croacia) [7] · `HT` (Haití) [1] · `HU` (Hungría) [14] · `ID` (Indonesia) [15] · `IE` (Irlanda) [11] · `IL` (Israel) [13] · `IN` (India) [16] · `IR` (Irán) [1] · `IS` (Islandia) [4] · `IT` (Italia) [16] · `JO` (Jordania) [3] · `JP` (Japón) [16] · `KE` (Kenya) [7] · `KH` (Camboya (ex Kampuchea)) [7] · `KM` (Comoras) [1] · `KP` (Corea, República Popular Democrática de ) [7] · `KR` (Corea, República de) [15] · `KZ` (Kazajstán) [1] · `LA` (Laos) [3] · `LB` (Líbano) [3] · `LI` (Liechtenstein) [3] · `LK` (Sri Lanka) [8] · `LT` (Lituania) [7] · `LU` (Luxemburgo) [6] · `LV` (Letonia) [6] · `MA` (Marruecos) [8] · `MD` (Moldavia, República de) [3]
… y 57 valores más.

**`valor_CIF_null`** (signo, 1 valores):

`∅` [1.041]

**`peso_neto_null`** (signo, 1 valores):

`∅` [1.041]

## Códigos y nomenclaturas de comercio exterior — `/comercio_exterior_nomenclaturas`

Filas totales: 325 · períodos — → — · muestra: tabla completa (325 filas).

| Columna | Rol | Valores distintos (muestra) | No nulos |
|---|---|---:|---:|
| `nombre_columna` | dimension | 5 | 325 |
| `codigo` | dimension | 315 | 325 |
| `codigo_descripcion` | dimension | 323 | 325 |

**Combinaciones `nombre_columna`** (5):

- gce_cod — 20 filas
- pais_cod — 240 filas
- rubro_cod — 7 filas
- subrubro_cod — 50 filas
- uso_economico_cod — 8 filas

**`codigo`** (dimension, 315 valores):

`000` [1] · `1` [2] · `2` [2] · `3` [2] · `4` [2] · `5` [1] · `6` [1] · `9` [2] · `101` [1] · `102` [1] · `103` [1] · `104` [1] · `105` [1] · `106` [1] · `107` [1] · `108` [1] · `109` [1] · `110` [1] · `111` [2] · `112` [1] · `121` [1] · `122` [1] · `199` [1] · `201` [1] · `202` [1] · `203` [1] · `204` [1] · `205` [1] · `206` [1] · `207` [1] · `208` [1] · `209` [1] · `210` [2] · `211` [1] · `212` [1] · `213` [1] · `214` [1] · `215` [1] · `220` [1] · `299` [1] · `302` [1] · `303` [1] · `304` [1] · `305` [1] · `306` [1] · `307` [1] · `308` [1] · `309` [1] · `310` [2] · `311` [1] · `312` [1] · `313` [1] · `314` [1] · `320` [1] · `399` [1] · `401` [1] · `402` [1] · `403` [1] · `404` [1] · `405` [1] · `410` [1] · `420` [1] · `499` [1] · `510` [1] · `521` [1] · `522` [1] · `530` [1] · `610` [1] · `620` [1] · `630` [1] · `700` [1] · `999` [1] · `AD` [1] · `AE` [1] · `AF` [1] · `AG` [1] · `AL` [1] · `AM` [1] · `AN` [1] · `AO` [1]
… y 235 valores más.

**`codigo_descripcion`** (dimension, 323 valores):

`Afganistán` [1] · `Albania` [1] · `Alimentos y bebidas básicos fundalmentalmente para el hogar` [1] · `Alimentos y bebidas básicos fundamentalmente para la industria` [1] · `Alimentos y bebidas elaborados fundalmentalmente para el hogar` [1] · `Alimentos y bebidas elaborados fundalmentalmente para la industria` [1] · `Andorra` [1] · `Angola` [1] · `Animales Vivos` [1] · `Antigua Y Barbuda` [1] · `Antillas Holandesas (territorio vinculado a Países Bajos)` [1] · `Arabia Saudita` [1] · `Argelia` [1] · `Argentina` [1] · `Armenia` [1] · `Artículos de consumo duraderos no especificados en otra partida ` [1] · `Artículos de consumo no duraderos no especificados en otra partida` [1] · `Artículos de consumo semiduraderos no especificados en otra partida ` [1] · `Aruba` [1] · `Australia` [1] · `Austria` [1] · `Azerbaiyán` [1] · `Azúcar ,cacao y artículos de confitería` [1] · `Bahamas` [1] · `Bahrein` [1] · `Bangladesh` [1] · `Barbados` [1] · `Bebidas, líquidos alcohólicos y vinagre` [1] · `Belarús` [1] · `Bélgica` [1] · `Belice` [1] · `Benin` [1] · `Bienes de Capital` [1] · `Bienes de capital excluido equipos de transporte` [1] · `Bienes de Consumo` [1] · `Bienes Intermedios` [1] · `Bienes no especificados en otras partidas` [1] · `Bolivia` [1] · `Bonaire, San Eustatius y Saba   ` [1] · `Bosnia y Herzegovina` [1] · `Botswana` [1] · `Brasil` [1] · `Brunei Darussalam` [1] · `Bulgaria` [1] · `Burkina Faso` [1] · `Burundi` [1] · `Bután` [1] · `Cabo Verde` [1] · `Café, té, yerba mate y especias` [1] · `Calzado y sus partes componentes` [1] · `Camboya (ex Kampuchea)` [1] · `Camerún` [1] · `Canadá` [1] · `Carburantes` [1] · `Carnes y sus preparados` [1] · `Caucho y sus manufacturas` [1] · `Cereales` [1] · `Chad` [1] · `Chile` [1] · `China` [1] · `Chipre` [1] · `Colombia` [1] · `COMBUSTIBLE Y ENERGIA` [1] · `Combustibles y Lubricantes` [1] · `Combustibles y lubricantes básicos` [1] · `Combustibles y lubricantes elaborados` [1] · `Comoras` [1] · `Confidencial` [1] · `CONFIDENCIAL` [1] · `Congo` [1] · `Corea, República de` [1] · `Corea, República Popular Democrática de ` [1] · `Costa Rica` [1] · `Côte d' Ivoire (Costa de Marfil)` [1] · `Croacia` [1] · `Cuba` [1] · `Curazao` [1] · `Desconocido` [1] · `DESCONOCIDO` [3] · `Dinamarca` [1]
… y 243 valores más.
