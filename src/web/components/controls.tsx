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
