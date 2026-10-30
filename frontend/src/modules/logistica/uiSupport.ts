export { button, control, panel, primary } from '../tesoreria/styles';
export { useTreasuryLoad as useLoad } from '../tesoreria/useTreasuryLoad';
export const errorText=(value:unknown)=>value instanceof Error?value.message:'No se pudo completar la operaci\u00f3n. Reintenta.';
export const labels:Record<string,string>={BORRADOR:'Borrador',PREPARADO:'Preparado',DESPACHADO:'Despachado',CANCELADO:'Cancelado',PENDIENTE:'Pendiente',PARCIAL:'Entrega parcial',ENTREGADO:'Entregado',PLANIFICADA:'Planificada',EN_CURSO:'En curso',FINALIZADA:'Finalizada',CANCELADA:'Cancelada',ENTREGA:'Entrega',FALLIDA:'Intento fallido',RECHAZADA:'Rechazada'};
