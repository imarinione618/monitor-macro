/** Contrato del Laboratorio (compartido servidor/cliente; sin dependencias de Node). */
export type LabFrequency = 'D' | 'M' | 'Q' | 'S' | 'A';
/** Naturaleza para elegir la agregación por defecto: saldos/índices/tasas → promedio; flujos → suma. */
export type LabNature = 'flow' | 'stock' | 'rate' | 'index' | 'balance';

export interface LabSeriesMeta {
  id: string;
  name: string;
  shortName: string;
  group: string;
  unit: string;
  frequency: LabFrequency;
  nature: LabNature;
  /** Organismo para «Fuente: one618 en base a …». */
  org: string;
  start: string | null;
  end: string | null;
  /** Notas breves (ajuste estacional, cobertura, quiebres). */
  note?: string;
}

/** Puntos: D 'YYYY-MM-DD'; M 'YYYY-MM'; Q 'YYYY-Qn'; S 'YYYY-Sn'; A 'YYYY'. */
export interface LabSeriesData { id: string; points: [string, number | null][] }

export const LAB_FREQUENCY_LABELS: Record<LabFrequency, string> = { D: 'Diaria', M: 'Mensual', Q: 'Trimestral', S: 'Semestral', A: 'Anual' };
export const LAB_FREQ_ORDER: LabFrequency[] = ['D', 'M', 'Q', 'S', 'A'];
