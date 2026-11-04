import type { SeriesDef } from '../types';

const salBase = {
  topic: 'laboral',
  family: 'salarios',
  frequency: 'M',
  measure: 'index',
  unit: 'Índice base oct-2016=100',
  base: 'oct-2016=100',
  seasonalAdjustment: 'original',
  geography: 'Total país',
  status: 'verificado',
} as const;

const SAL_NOTES = [
  'Índice de salarios (INDEC, metodología N.º 16): aísla cambios por horas trabajadas, ausentismo, premios y características individuales.',
];

export const LABORAL: SeriesDef[] = [
  ...(
    [
      ['0', 'total', 'Nivel general', 'Salarios total', 1],
      ['100', 'registrado', 'Total registrado', 'Registrados', 2],
      ['110', 'privado_registrado', 'Sector privado registrado', 'Privado registrado', 1],
      ['120', 'publico', 'Sector público', 'Público', 1],
      ['200', 'no_registrado', 'Sector privado no registrado', 'Privado no registrado', 1],
    ] as const
  ).map(
    ([codigo, slug, name, short, priority]): SeriesDef => ({
      ...salBase,
      id: `laboral.salarios.${slug}`,
      name: `Índice de salarios — ${name}`,
      shortName: short,
      priority,
      source: { kind: 'api', dataset: 'indice_salarios', selector: { codigo, tipo_de_indicador: 'Indice' } },
      notes:
        codigo === '200'
          ? [
              ...SAL_NOTES,
              'Sector privado no registrado: el valor de cada mes refleja salarios de unos 5 meses antes (rezago de la fuente, EPH). La serie llega hasta el último mes publicado, pero su contenido está desfasado.',
            ]
          : SAL_NOTES,
      headline: codigo === '0' ? { order: 6, transform: 'pct_yoy' } : undefined,
    }),
  ),
  // ---------------- Salario real (derivado)
  {
    ...salBase,
    id: 'laboral.salarios.registrado_real',
    family: 'salarios_reales',
    name: 'Salario real — Total registrado (índice de salarios / IPC nacional)',
    shortName: 'Salario real registrado',
    unit: 'Índice base dic-2016=100',
    base: 'dic-2016=100',
    priority: 1,
    source: {
      kind: 'derived',
      op: { type: 'real_index', nominal: 'laboral.salarios.registrado', deflator: 'precios.ipc.ng.nacional', basePeriod: '2016-12' },
    },
    notes: [
      'Cálculo propio: (índice de salarios_t / IPC nacional nivel general_t), reescalado a dic-2016=100. Ambos sin desestacionalizar, mismo mes calendario.',
      'Se usa el IPC nacional (cobertura nacional, desde dic-2016) como deflactor compatible con un índice salarial nacional.',
    ],
  },
  {
    ...salBase,
    id: 'laboral.salarios.total_real',
    family: 'salarios_reales',
    name: 'Salario real — Nivel general (índice de salarios / IPC nacional)',
    shortName: 'Salario real total',
    unit: 'Índice base dic-2016=100',
    base: 'dic-2016=100',
    priority: 1,
    source: {
      kind: 'derived',
      op: { type: 'real_index', nominal: 'laboral.salarios.total', deflator: 'precios.ipc.ng.nacional', basePeriod: '2016-12' },
    },
    notes: [
      'Cálculo propio: (índice de salarios_t / IPC nacional_t), reescalado a dic-2016=100.',
      'Incluye el sector no registrado, cuyo valor mensual refleja salarios de unos 5 meses antes: el total (y su versión real) incorpora ese desfase.',
    ],
  },
  {
    ...salBase,
    id: 'laboral.salarios.privado_registrado_real',
    family: 'salarios_reales',
    name: 'Salario real — Sector privado registrado (índice de salarios / IPC nacional)',
    shortName: 'Salario real privado reg.',
    unit: 'Índice base dic-2016=100',
    base: 'dic-2016=100',
    priority: 1,
    source: {
      kind: 'derived',
      op: { type: 'real_index', nominal: 'laboral.salarios.privado_registrado', deflator: 'precios.ipc.ng.nacional', basePeriod: '2016-12' },
    },
    notes: ['Cálculo propio: (índice de salarios_t / IPC nacional_t), reescalado a dic-2016=100.'],
  },
  {
    ...salBase,
    id: 'laboral.salarios.publico_real',
    family: 'salarios_reales',
    name: 'Salario real — Sector público (índice de salarios / IPC nacional)',
    shortName: 'Salario real público',
    unit: 'Índice base dic-2016=100',
    base: 'dic-2016=100',
    priority: 2,
    source: {
      kind: 'derived',
      op: { type: 'real_index', nominal: 'laboral.salarios.publico', deflator: 'precios.ipc.ng.nacional', basePeriod: '2016-12' },
    },
    notes: ['Cálculo propio: (índice de salarios_t / IPC nacional_t), reescalado a dic-2016=100.'],
  },
  // ---------------- EPH: tasas (31 aglomerados urbanos)
  ...(
    [
      ['tasa_de_actividad', 'actividad', 'Tasa de actividad', 'Actividad', 'Población económicamente activa / población total', 1],
      ['tasa_de_empleo', 'empleo', 'Tasa de empleo', 'Empleo', 'Ocupados / población total', 1],
      ['tasa_de_desocupacion', 'desocupacion', 'Tasa de desocupación', 'Desocupación', 'Desocupados / PEA', 1],
      ['tasa_de_subocupacion', 'subocupacion', 'Tasa de subocupación', 'Subocupación', 'Subocupados / PEA', 1],
      ['tasa_de_subocupacion_demandante', 'subocupacion_demandante', 'Tasa de subocupación demandante', 'Subocup. demandante', 'Subocupados que buscan otra ocupación / PEA', 2],
      ['tasa_de_subocupacion_no_demandante', 'subocupacion_no_demandante', 'Tasa de subocupación no demandante', 'Subocup. no demandante', 'Subocupados que no buscan otra ocupación / PEA', 2],
      ['tasa_de_ocupacion_demandante', 'ocupados_demandantes', 'Tasa de ocupados demandantes de empleo', 'Ocupados demandantes', 'Ocupados que buscan otra ocupación / PEA', 2],
      ['tasa_de_empleo_formal', 'empleo_formal', 'Tasa de empleo formal', 'Empleo formal', 'Ocupados formales / población total. Disponible desde el 4.º trim. 2023', 2],
      ['tasa_de_empleo_informal', 'empleo_informal', 'Tasa de empleo informal', 'Empleo informal', 'Ocupados informales / población total. Disponible desde el 4.º trim. 2023', 2],
    ] as const
  ).map(
    ([field, slug, name, short, def, priority]): SeriesDef => ({
      id: `laboral.eph.${slug}`,
      topic: 'laboral',
      family: 'eph_tasas',
      name: `EPH — ${name}`,
      shortName: short,
      frequency: 'Q',
      measure: 'rate',
      unit: '%',
      seasonalAdjustment: 'original',
      geography: 'Total 31 aglomerados urbanos',
      coverage: 'Población urbana de los 31 aglomerados relevados por la EPH. No representa el total nacional ni la población rural.',
      priority,
      status: 'verificado',
      source: { kind: 'api', dataset: 'mercado_trabajo_eph', selector: { area_geografica_nom: 'T_31_A' }, valueField: field },
      notes: [
        `Definición: ${def}.`,
        'Serie sin desestacionalizar: comparar contra el mismo trimestre del año anterior (diferencia en p.p.).',
        'Hay trimestres con cobertura parcial (p.ej. 3T-2019 sin Gran Resistencia; 3T-2020 sin Ushuaia-Río Grande): ver observaciones.',
      ],
      headline: slug === 'desocupacion' ? { order: 7, transform: 'level', compare: 'diff_yoy_pp' } : undefined,
    }),
  ),
  // ---------------- Pobreza (contexto)
  ...(
    [
      ['tasa_pobreza_personas', 'pobreza_personas', 'Pobreza — personas', 'Pobreza (personas)'],
      ['tasa_indigencia_personas', 'indigencia_personas', 'Indigencia — personas', 'Indigencia (personas)'],
      ['tasa_pobreza_hogares', 'pobreza_hogares', 'Pobreza — hogares', 'Pobreza (hogares)'],
      ['tasa_indigencia_hogares', 'indigencia_hogares', 'Indigencia — hogares', 'Indigencia (hogares)'],
    ] as const
  ).map(
    ([field, slug, name, short]): SeriesDef => ({
      id: `laboral.pobreza.${slug}`,
      topic: 'laboral',
      family: 'pobreza',
      name: `EPH — ${name}`,
      shortName: short,
      frequency: 'S',
      measure: 'rate',
      unit: '%',
      seasonalAdjustment: 'original',
      geography: 'Total 31 aglomerados urbanos',
      coverage: 'Población urbana de los 31 aglomerados de la EPH; no es el total nacional.',
      priority: 2,
      status: 'verificado',
      source: { kind: 'api', dataset: 'pobreza_eph', selector: { area_geografica_nom: 'T_31_A' }, valueField: field },
    }),
  ),
];

/** Fuentes complementarias (no INDEC API). Registradas, no implementadas en el núcleo. */
export const LABORAL_COMPLEMENTARIAS = [
  {
    indicador: 'Trabajadores registrados (SIPA) / asalariados privados registrados',
    fuente: 'Secretaría de Trabajo, Empleo y Seguridad Social — Situación y evolución del trabajo registrado (SIPA)',
    nota: 'No pertenece al Catálogo API-INDEC. Requiere integración separada (planillas oficiales del MTEySS).',
  },
  {
    indicador: 'RIPTE — Remuneración imponible promedio de los trabajadores estables',
    fuente: 'Secretaría de Seguridad Social / Secretaría de Trabajo',
    nota: 'No pertenece al Catálogo API-INDEC. Disponible en datos.gob.ar (series de tiempo) — pendiente de integración.',
  },
];
