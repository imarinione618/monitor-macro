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

/** Adapta los índices existentes sin persistir otra copia ni modificar los Google Sheets. */
export function buildIpcContributions(inputs: ClientSeries[]): ClientSeries[] {
  const byId = new Map(inputs.map((s) => [s.def.id, s]));
  const general = byId.get(IPC_GENERAL);
  if (!general) return [];
  return IPC_CONTRIBUTIONS.flatMap(({ key, name, weight }) => {
    const category = byId.get(`precios.ipc.cat.${key}.nacional`);
    if (!category) return [];
    const observations = ipcContribution(category.observations, general.observations, weight);
    const valid = observations.filter((o) => o.value !== null);
    return [{
      ...category,
      def: {
        ...category.def,
        id: contributionId(key),
        family: 'ipc_contribuciones',
        name: `IPC — Aporte estimado de ${name.toLowerCase()} a la inflación mensual`,
        shortName: name,
        measure: 'incidence' as const,
        unit: 'p.p.',
        base: undefined,
        source: { kind: 'derived' as const, op: { type: 'ipc_contribution' as const, category: category.def.id, general: general.def.id, weight } },
        notes: IPC_CONTRIBUTION_NOTES,
      },
      observations,
      missing: category.missing || general.missing || valid.length === 0,
      firstPeriod: valid[0]?.period ?? null,
      lastPeriod: valid.at(-1)?.period ?? null,
      // Fecha más antigua: no presentar como reciente un insumo desactualizado.
      retrievedAt: category.retrievedAt && general.retrievedAt ? [category.retrievedAt, general.retrievedAt].sort()[0]! : null,
      stale: category.stale || general.stale,
      error: [category.error, general.error].filter(Boolean).join('; ') || undefined,
      synthetic: category.synthetic || general.synthetic,
    }];
  });
}
