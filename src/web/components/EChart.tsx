'use client';

import { useEffect, useRef, useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { echarts } from '@/web/lib/echarts';
import { DARK_THEME, LIGHT_THEME, type ChartTheme } from '@/web/lib/palette';

/** Tema del gráfico según el esquema de color del sistema (claro/oscuro). */
export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return dark ? DARK_THEME : LIGHT_THEME;
}

/** Ancho observado de un elemento (para decisiones de layout del gráfico). */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? 0;
      setW(Math.round(cw));
    });
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

interface EChartProps {
  option: EChartsCoreOption | null;
  ariaLabel: string;
  className?: string;
}

/** Contenedor ECharts (canvas) que se redimensiona con su caja. */
export function EChart({ option, ariaLabel, className }: EChartProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    setReady(true);
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chart.current || !option) return;
    chart.current.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option, ready]);

  return (
    <div className={`echart-wrap ${className ?? ''}`}>
      <div ref={el} className="echart" role="img" aria-label={ariaLabel} />
      {!ready && (
        <div className="echart-loading" aria-live="polite">
          Cargando gráfico…
        </div>
      )}
    </div>
  );
}
