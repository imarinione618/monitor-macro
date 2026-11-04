/**
 * Registro modular de ECharts (solo lo que usa el dashboard). Sirve en el navegador
 * y en Node (render SSR a SVG en los tests de exportación).
 */
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, GraphicComponent, MarkLineComponent, CanvasRenderer, SVGRenderer]);

export { echarts };
