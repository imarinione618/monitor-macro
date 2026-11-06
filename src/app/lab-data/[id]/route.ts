/** Datos por serie del Laboratorio: un JSON estático por variable (se descarga a demanda). */
import { labCatalog, labData } from '@/web/server/lab';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return labCatalog().map((m) => ({ id: `${m.id}.json` }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const data = labData(decodeURIComponent(id).replace(/\.json$/, ''));
  if (!data) return Response.json({ error: 'Serie no encontrada' }, { status: 404 });
  return Response.json(data);
}
