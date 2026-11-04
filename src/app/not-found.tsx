import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="state-box" role="status">
      <h2>Página no encontrada</h2>
      <p>
        <Link href="/">Volver al resumen</Link>
      </p>
    </div>
  );
}
