/**
 * Register Chart.js components needed by PrimeVue Chart.
 * PrimeVue's <Chart> component delegates to Chart.js but requires
 * the desired chart types and scales to be registered first.
 */
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

export default defineNuxtPlugin(() => {
  // Chart.js registered globally
});
