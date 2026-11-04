'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="state-box state-error" role="alert">
      <h2>Ocurrió un error al mostrar esta página</h2>
      <p>{error.message || 'Error inesperado.'}</p>
      {error.digest && <p className="muted small">Referencia: {error.digest}</p>}
      <button type="button" className="btn" onClick={() => reset()}>
        Reintentar
      </button>
    </div>
  );
}
