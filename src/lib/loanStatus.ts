import type { LoanStatus } from '$lib/server/loans';

export interface LoanStatusConfig {
  label: string;
  labelLong: string;
  classes: string; // clases Tailwind para el badge
}

export const LOAN_STATUS: Record<LoanStatus, LoanStatusConfig> = {
  // Acción pendiente del propietario — azul
  requested: {
    label: 'Requested',
    labelLong: 'Request sent',
    classes: 'bg-blue-50 text-blue-700 ring-blue-200'
  },
  // En proceso de entrega — amarillo
  accepted: {
    label: 'Accepted',
    labelLong: 'Accepted — pending delivery',
    classes: 'bg-yellow-50 text-yellow-700 ring-yellow-200'
  },
  // Libro físicamente fuera — naranja
  active: {
    label: 'Active',
    labelLong: 'Active loan',
    classes: 'bg-orange-50 text-orange-700 ring-orange-200'
  },
  // Acción pendiente del propietario — morado
  return_requested: {
    label: 'Return requested',
    labelLong: 'Return requested',
    classes: 'bg-purple-50 text-purple-700 ring-purple-200'
  },
  // Ciclo completado — verde
  returned: {
    label: 'Returned',
    labelLong: 'Returned',
    classes: 'bg-green-50 text-green-700 ring-green-200'
  },
  // Terminal negativo — rojo tenue
  rejected: {
    label: 'Rejected',
    labelLong: 'Rejected',
    classes: 'bg-red-50 text-red-600 ring-red-200'
  },
  // Terminal neutro — paper
  cancelled: {
    label: 'Cancelled',
    labelLong: 'Cancelled',
    classes: 'bg-paper-ui text-ink-faint ring-paper-border'
  }
};
