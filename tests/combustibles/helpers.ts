import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitLines } from '../../src/combustibles/csv';

export const FIXTURES = path.join(__dirname, 'fixtures');
export const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

export async function* chunks(text: string, size = 17): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}
export const linesOf = (text: string) => splitLines(chunks(text));

const dirs: string[] = [];
export function tmpDir(): string { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-combustibles-')); dirs.push(dir); return dir; }
export function cleanup(): void { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); }

const PRODUCT_NAMES: Record<string, string> = { '2': 'Nafta (súper) entre 92 y 95 Ron', '3': 'Nafta (premium) de más de 95 Ron', '19': 'Gas Oil Grado 2', '21': 'Gas Oil Grado 3', '6': 'GNC' };

export interface Ev { station: number; product?: string; price: number | string; at: string; province?: string; horario?: 2 | 3 }

/** 'YYYY-MM-DD HH:MM' → 'dd/mm/yyyy hh:mm' (formato del histórico). */
const dmy = (at: string) => `${at.slice(8, 10)}/${at.slice(5, 7)}/${at.slice(0, 4)} ${at.slice(11, 16)}`;

export function historicoCsv(events: Ev[], rawDate?: (e: Ev) => string): string {
  const header = 'idempresa,empresa,direccion,localidad,provincia,idproducto,producto,idtipohorario,tipohorario,precio,fecha_vigencia,idempresabandera,empresabandera,latitud,longitud,geojson,anio,mes';
  const rows = events.map(e => {
    const product = e.product ?? '2';
    const h = e.horario ?? 2;
    return [e.station, `"EST ${e.station}, S.A."`, 'Calle 1', 'LOCALIDAD', e.province ?? 'BUENOS AIRES', product, PRODUCT_NAMES[product], h, h === 2 ? 'Diurno' : 'Nocturno', e.price, rawDate ? rawDate(e) : dmy(e.at), 28, 'PUMA', '-34.6', '-58.5', '"{""type"":""Point"",""coordinates"":[-58.5,-34.6]}"', e.at.slice(0, 4), Number(e.at.slice(5, 7))].join(',');
  });
  return '﻿' + [header, ...rows].join('\n') + '\n';
}

export function vigentesCsv(events: Ev[]): string {
  const header = 'indice_tiempo,idempresa,cuit,empresa,direccion,localidad,provincia,region,idproducto,producto,idtipohorario,tipohorario,precio,fecha_vigencia,idempresabandera,empresabandera,latitud,longitud,geojson';
  const rows = events.map(e => {
    const product = e.product ?? '2';
    const h = e.horario ?? 2;
    return [e.at.slice(0, 7), e.station, '30-1-1', `EST ${e.station}`, 'Calle 1', 'LOCALIDAD', e.province ?? 'BUENOS AIRES', 'PAMPEANA', product, PRODUCT_NAMES[product], h, h === 2 ? 'Diurno' : 'Nocturno', e.price, `${e.at}:00`, 28, 'PUMA', '-34.6', '-58.5', '"{""type"":""Point""}"'].join(',');
  });
  return '﻿' + [header, ...rows].join('\r\n') + '\r\n';
}

export interface EessRow { period: string; product?: string; canal?: string; province?: string; price: number | string; volume: number | string; noMov?: string }

/** Formato del archivo vigente (columna periodo 'YYYY/MM'). */
export function eessVigenteCsv(rows: EessRow[]): string {
  const header = 'fecha,periodo,operador,nro_inscripcion,bandera,fecha_de_baja,cuit,tipo_negocio,direccion,localidad,provincia,producto,canal_de_comercializacion,precio_sin_impuestos,precio_con_impuestos,volumen,precio_surtidor,no_movimientos,excentos';
  return '﻿' + [header, ...rows.map((r, i) => [`${r.period.replace('/', '-')}-28 00:00:00`, r.period, `OP ${i}`, i, 'YPF', '', '30-1-1', 'Estación de servicio', 'Calle', 'LOC', r.province ?? 'CORDOBA', r.product ?? 'Nafta (súper) entre 92 y 95 Ron', r.canal ?? 'Al público', 1, 1, r.volume, r.price, r.noMov ?? 'NO', 'f'].join(','))].join('\n') + '\n';
}

/** Formato de los archivos anuales (columnas anio y mes). */
export function eessAnualCsv(rows: EessRow[]): string {
  const header = 'anio,mes,operador,nro_inscripcion,bandera,fecha_de_baja,cuit,tipo_negocio,direccion,localidad,provincia,producto,canal_de_comercializacion,precio_sin_impuestos,precio_con_impuestos,volumen,precio_surtidor,no_novimientos,exentos';
  return '﻿' + [header, ...rows.map((r, i) => [r.period.slice(0, 4), r.period.slice(5), `OP ${i}`, i, 'YPF', '', '30-1-1', 'Estación de servicio', 'Calle', 'LOC', r.province ?? 'CORDOBA', r.product ?? 'Nafta (súper) entre 92 y 95 Ron', r.canal ?? 'Al público', 1, 1, r.volume, r.price, r.noMov ?? 'NO', 'f'].join(','))].join('\n') + '\n';
}
