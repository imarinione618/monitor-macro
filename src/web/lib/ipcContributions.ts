import { ipcContribution } from '@/core/transforms';
import type { ClientSeries } from './types';

export const IPC_GENERAL = 'precios.ipc.ng.nacional';
// Orden de apilado: núcleo en la base, luego estacionales y regulados.
export const IPC_CONTRIBUTIONS = [
  { key: 'nucleo', name: 'Núcleo', weight: 0.679236, colorSlot: 1 },
  { key: 'estacionales', name: 'Estacionales', weight: 0.113209, colorSlot: 2 },
  { key: 'regulados', name: 'Regulados', weight: 0.208047, colorSlot: 0 },
] as const;

export const contributionId = (key: string) => `precios.ipc.aporte.${key}.nacional`;
export const IPC_CONTRIBUTION_NOTES = [
  'Estimación propia: aporte mensual (p.p.) = 100 × peso × (IPCcategoría_t − IPCcategoría_t−1) / IPCgeneral_t−1. No es una incidencia publicada por el INDEC.',
  'Pesos fijos: núcleo 0,679236; estacionales 0,113209; regulados 0,208047. Suman 1,000492 y se conservan sin normalizar; la suma de aportes puede diferir de la inflación general.',
];

/**
 * Ponderaciones nacionales de las 12 divisiones COICOP del IPC (estructura de diciembre de 2016, INDEC):
 * promedio de las ponderaciones regionales por el peso de cada región (GBA 0,4467; Pampeana 0,3419; Noreste 0,0451;
 * Noroeste 0,0688; Cuyo 0,0518; Patagonia 0,0457). Suman 0,9999955 (redondeo de la fuente); no se normalizan.
 */
export const IPC_DIVISION_WEIGHTS = [
  { key: 'alimentos', name: 'Alimentos y bebidas no alcohólicas', weight: 0.26969116 },
  { key: 'alcohol_tabaco', name: 'Bebidas alcohólicas y tabaco', weight: 0.03484313 },
  { key: 'vestimenta', name: 'Prendas de vestir y calzado', weight: 0.09908074 },
  { key: 'vivienda', name: 'Vivienda, agua, electricidad, gas y otros combustibles', weight: 0.09403842 },
  { key: 'equipamiento', name: 'Equipamiento y mantenimiento del hogar', weight: 0.06365028 },
  { key: 'salud', name: 'Salud', weight: 0.08003129 },
  { key: 'transporte', name: 'Transporte', weight: 0.10989427 },
  { key: 'comunicacion', name: 'Comunicación', weight: 0.02815272 },
  { key: 'recreacion', name: 'Recreación y cultura', weight: 0.07252541 },
  { key: 'educacion', name: 'Educación', weight: 0.02312726 },
  { key: 'restaurantes', name: 'Restaurantes y hoteles', weight: 0.08972012 },
  { key: 'otros', name: 'Bienes y servicios varios', weight: 0.03524069 },
] as const;

export const divisionContributionId = (key: string) => `precios.ipc.aporte.div.${key}.nacional`;
/** Fila de referencia del gráfico de incidencias: variación mensual del nivel general (= suma de las incidencias). */
export const DIVISION_TOTAL_ID = 'precios.ipc.aporte.div.total.nacional';
export const IPC_DIVISION_NOTES = [
  'Estimación propia: incidencia (p.p.) = 100 × ponderación × (IPCdivisión_t − IPCdivisión_t−1) / IPCgeneral_t−1, con las ponderaciones nacionales de diciembre de 2016. No es una incidencia publicada por el INDEC.',
  'La suma de las 12 divisiones reproduce la variación mensual del nivel general salvo redondeo de los índices (diferencia máxima 0,08 p.p. desde 2017; 0,02 p.p. en los últimos 12 meses).',
];

interface Spec {
  /** Serie de índice de la apertura (categoría o división). */
  sourceId: string;
  id: string;
  family: string;
  name: string;
  shortName: string;
  weight: number;
  notes: string[];
}

/** Aporte de una apertura a la variación del nivel general, sin persistir otra copia ni modificar los Google Sheets. */
function derive(source: ClientSeries, general: ClientSeries, spec: Spec): ClientSeries {
  const observations = ipcContribution(source.observations, general.observations, spec.weight);
  const valid = observations.filter((o) => o.value !== null);
  return {
    ...source,
    def: {
      ...source.def,
      id: spec.id,
      family: spec.family,
      name: spec.name,
      shortName: spec.shortName,
      measure: 'incidence' as const,
      unit: 'p.p.',
      base: undefined,
      source: { kind: 'derived' as const, op: { type: 'ipc_contribution' as const, category: source.def.id, general: general.def.id, weight: spec.weight } },
      notes: spec.notes,
    },
    observations,
    missing: source.missing || general.missing || valid.length === 0,
    firstPeriod: valid[0]?.period ?? null,
    lastPeriod: valid.at(-1)?.period ?? null,
    // Fecha más antigua: no presentar como reciente un insumo desactualizado.
    retrievedAt: source.retrievedAt && general.retrievedAt ? [source.retrievedAt, general.retrievedAt].sort()[0]! : null,
    stale: source.stale || general.stale,
    error: [source.error, general.error].filter(Boolean).join('; ') || undefined,
    synthetic: source.synthetic || general.synthetic,
  };
}

function build(inputs: ClientSeries[], specs: Spec[]): ClientSeries[] {
  const byId = new Map(inputs.map((s) => [s.def.id, s]));
  const general = byId.get(IPC_GENERAL);
  if (!general) return [];
  return specs.flatMap((spec) => {
    const source = byId.get(spec.sourceId);
    return source ? [derive(source, general, spec)] : [];
  });
}

/** Aportes de núcleo, estacionales y regulados. */
export function buildIpcContributions(inputs: ClientSeries[]): ClientSeries[] {
  return build(
    inputs,
    IPC_CONTRIBUTIONS.map(({ key, name, weight }) => ({
      sourceId: `precios.ipc.cat.${key}.nacional`,
      id: contributionId(key),
      family: 'ipc_contribuciones',
      name: `IPC — Aporte estimado de ${name.toLowerCase()} a la inflación mensual`,
      shortName: name,
      weight,
      notes: IPC_CONTRIBUTION_NOTES,
    })),
  );
}

/**
 * Incidencias de las 12 divisiones más una fila de referencia con la variación mensual del nivel general
 * (misma fórmula con peso 1 sobre el propio nivel general = var. % m/m).
 */
export function buildIpcDivisionContributions(inputs: ClientSeries[]): ClientSeries[] {
  const family = 'ipc_incidencias_division';
  return build(inputs, [
    {
      sourceId: IPC_GENERAL,
      id: DIVISION_TOTAL_ID,
      family,
      name: 'IPC — Nivel general, variación % mensual',
      shortName: 'Nivel general (var. %)',
      weight: 1,
      notes: IPC_DIVISION_NOTES,
    },
    ...IPC_DIVISION_WEIGHTS.map(({ key, name, weight }) => ({
      sourceId: `precios.ipc.div.${key}.nacional`,
      id: divisionContributionId(key),
      family,
      name: `IPC — Incidencia estimada de ${name.toLowerCase()} en la inflación mensual`,
      shortName: name,
      weight,
      notes: IPC_DIVISION_NOTES,
    })),
  ]);
}
