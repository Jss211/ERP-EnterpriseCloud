import { ventasService } from '../../services/ventasService';
import { localInvoiceRepository } from '../compras/facturas/localRepository';
import type { Invoice } from '../compras/facturas/types';
import type { ObligationSources } from './types';
import { mapPayables, mapReceivables } from './sourceMapping';
export const treasurySources: ObligationSources = {
  async list(kind) {
    if (kind === 'COBRAR') {
      const raw = localStorage.getItem('erp_estado_cuenta');
      let legacy;
      try { legacy = raw === null ? [] : JSON.parse(raw); if (!Array.isArray(legacy)) throw new Error(); }
      catch { throw new Error('No se puede leer el estado de cuenta anterior. Los datos se conservan intactos.'); }
      return mapReceivables(await ventasService.getVentas(true,true), legacy);
    }
    const invoices: Invoice[] = [];
    let page = 1;
    for (;;) {
      const result = await localInvoiceRepository.list({ search: '', supplierId: '', currency: '', status: 'REGISTRADA', from: '', to: '', page, pageSize: 100 });
      if (result.items.some(i => invoices.some(old => old.id === i.id))) throw new Error('El listado de facturas cambió durante la consulta. Reintenta.');
      invoices.push(...result.items);
      if (invoices.length === result.total) break;
      if (!result.items.length || invoices.length > result.total) throw new Error('No se pudo leer el conjunto completo de facturas.');
      page++;
    }
    return mapPayables(invoices);
  },
};
