import type { StoreState } from '@/web/server/store';

export function SyntheticBanner() {
  return (
    <div className="synthetic-banner" role="alert">
      <strong>DATOS SINTÉTICOS DE PRUEBA — NO SON DATOS REALES</strong>
      <span> Store de desarrollo con valores inventados (manifest: dataMode = synthetic). No usar para análisis ni presentaciones.</span>
    </div>
  );
}

/** Store vacío o ilegible: mensaje con la acción a seguir. */
export function StoreProblem({ state }: { state: StoreState }) {
  if (state.status === 'error') {
    return (
      <div className="state-box state-error" role="alert">
        <h2>No se pudieron leer los datos</h2>
        <p>{state.error}</p>
        <p>
          Revisá el archivo indicado o regenerá el store con <code>npm run data:refresh</code> (o <code>npm run data:refresh -- --full</code>).
        </p>
      </div>
    );
  }
  return (
    <div className="state-box" role="status">
      <h2>Todavía no hay datos</h2>
      <p>
        El store <code>{state.dirLabel}</code> está vacío. Ejecutá <code>npm run data:refresh</code> para descargar las series desde la API del INDEC
        (requiere <code>INDEC_API_TOKEN</code> en <code>.env</code>) y recargá esta página.
      </p>
      <p className="muted">
        Para desarrollar sin token: <code>npm run fixtures:generate</code> y <code>DATA_MODE=fixtures npm run dev</code> (datos sintéticos, marcados como tales).
      </p>
    </div>
  );
}
