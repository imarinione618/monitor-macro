# Cómo agregar una serie

Ejemplo: agregar el IPC de la división "Transporte" para la región Patagonia.

## 1. Encontrar los valores exactos en la API

```bash
npm run data:discover          # regenera docs/catalogo-dimensiones.md
```

Buscá en `docs/catalogo-dimensiones.md` el endpoint (`ipc_nacional`) y los valores exactos de las columnas: `clasificador`, `nivel`, `codigo`, `region` y `tipo_de_indicador`. Los valores distinguen mayúsculas y acentos; por ejemplo, `División` y `Nivel General`.

## 2. Declararla en el registro

Agregá un objeto `SeriesDef` en el archivo del tema (`src/core/registry/precios.ts`):

```ts
{
  id: 'precios.ipc.div.transporte.patagonia',   // estable: nunca renombrar
  topic: 'precios',
  family: 'ipc_divisiones_regiones',            // agrupa pestaña DATOS_* y gráficos
  name: 'IPC — Transporte, Región Patagonia',
  shortName: 'Transporte (Patagonia)',
  frequency: 'M',
  measure: 'index',                             // define transformaciones válidas
  unit: 'Índice base dic-2016=100',
  base: 'dic-2016=100',
  seasonalAdjustment: 'original',
  geography: 'Región Patagonia',
  priority: 2,
  status: 'pendiente_verificacion',
  source: {
    kind: 'api',
    dataset: 'ipc_nacional',
    selector: { clasificador: 'COICOP Argentina 2019', nivel: 'División', codigo: '07', region: 'Patagonia', tipo_de_indicador: 'Indice' },
  },
  notes: ['...'],
}
```

Antes de declararla, revisá dos cosas:
- **Filtros de descarga.** Si el dataset tiene `fetchFilters` en `src/core/datasets.ts`, comprobá que no excluyan las filas nuevas. Por ejemplo, el IPC descarga solo `Nivel General`, `Categoría` y `División`. Para usar `Grupo` hay que ampliar el filtro.
- **Agregación.** Para series que surgen de sumar filas (comercio exterior), usá `aggregate: 'sum'` y `valueField`.

## 3. Verificar y descargar

```bash
npm run data:check     # el selector debe dar exactamente 1 valor por período
npm run data:refresh   # descarga y normaliza
npm test
```

Si `data:check` informa 0 filas o duplicados, corregí el selector. Cuando pase, cambiá `status` a `'verificado'`.

## 4. Publicar

- **Google Sheets:** `npm run sheets:sync` agrega la serie como **columna nueva al final** de la pestaña DATOS_* de su familia y frecuencia, sin reordenar las existentes. Si la familia es nueva, crea su pestaña. Los gráficos del usuario no se tocan.
- **Dashboard:** la serie aparece en los selectores de su tema y familia. Para que sea una tarjeta del resumen, agregá `headline: { order, transform, compare }` con transformaciones válidas para su `measure` (un test lo verifica).

## Reglas
- Una serie = una frecuencia, una unidad, un ajuste estacional y una base.
- No reutilices un ID para otra cosa ni lo renombres. Si una serie se discontinúa, dejala en el registro con una nota.
- Las series derivadas (por ejemplo, salario real) usan `source: { kind: 'derived', op: ... }` y deben documentar el método en `notes`.
