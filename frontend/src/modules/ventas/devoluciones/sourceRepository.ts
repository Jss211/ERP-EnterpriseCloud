import { ventasService } from '../../../services/ventasService';
import { customerRepository, productRepository } from '../../../repositories/masterRepositories';
import type { ReturnSources } from './types';
import { mapSaleSources } from './sourceMapping';

function readLegacy(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error();
    return data;
  } catch { throw new Error(`No se puede leer ${key}. Los documentos originales se conservan intactos.`); }
}
export const returnSources: ReturnSources = {
  async list() {
    const [sales, customers, products] = await Promise.all([ventasService.getVentas(true), customerRepository.list(), productRepository.list()]);
    const sources = mapSaleSources(sales, readLegacy('erp_ordenes_venta'), readLegacy('erp_estado_cuenta'), customers);
    // Only explicit product IDs can be enriched; never match a sale description.
    return sources.map(s => ({ ...s, lines: s.lines.map(l => {
      const product = products.find(p => p.id === l.productId);
      return { ...l, description: l.description || product?.descripcion || '' };
    }) }));
  },
};
