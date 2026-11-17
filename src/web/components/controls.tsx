'use client';

import { useId, type ReactNode } from 'react';

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
}

/** Grupo de opciones excluyentes (radio nativo, accesible con teclado). */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className="ctl seg">
      <legend>{label}</legend>
      <div className="seg-row">
        {options.map((o) => (
          <label key={o.value} className={`seg-opt${o.disabled ? ' is-disabled' : ''}`} title={o.title}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface PeriodRangeProps {
  /** Períodos disponibles, ascendentes (formato canónico: se comparan como texto). */
  periods: string[];
  from: string;
  to: string;
  format: (p: string) => string;
  onChange: (from: string, to: string) => void;
}

/** Desde / Hasta sobre una lista de períodos: cualquier tramo de la historia disponible. */
export function PeriodRange({ periods, from, to, format, onChange }: PeriodRangeProps) {
  const id = useId();
  if (!periods.length) return null;
  const desc = [...periods].reverse();
  return (
    <div className="ctl-pair">
      <div className="ctl">
        <label htmlFor={`${id}-d`} className="ctl-label">
          Desde
        </label>
        <select id={`${id}-d`} value={from} onChange={(e) => onChange(e.target.value, to < e.target.value ? e.target.value : to)}>
          {desc.map((p) => (
            <option key={p} value={p} disabled={p > to}>
              {format(p)}
            </option>
          ))}
        </select>
      </div>
      <div className="ctl">
        <label htmlFor={`${id}-h`} className="ctl-label">
          Hasta
        </label>
        <select id={`${id}-h`} value={to} onChange={(e) => onChange(from > e.target.value ? e.target.value : from, e.target.value)}>
          {desc.map((p) => (
            <option key={p} value={p} disabled={p < from}>
              {format(p)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  hint?: ReactNode;
}

export function Select<T extends string>({ label, value, options, onChange, hint }: SelectProps<T>) {
  const id = useId();
  return (
    <div className="ctl">
      <label htmlFor={id} className="ctl-label">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
            {o.disabled ? ' (no válida)' : ''}
          </option>
        ))}
      </select>
      {hint && <div className="ctl-hint">{hint}</div>}
    </div>
  );
}
