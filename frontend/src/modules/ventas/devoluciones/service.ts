import type { CustomerReturn, ReturnDraft, ReturnRepository, ReturnSources, SaleSource } from './types';
import { availability, draftIdentity, sameSource, validateAvailability, validateDraft } from './domain';

export function createReturnService(repository: ReturnRepository, sources: ReturnSources) {
  async function history(source: SaleSource) {
    const records: CustomerReturn[] = [];
    let page = 1;
    for (;;) {
      const result = await repository.list({ search: '', customer: '', from: '', to: '', status: '', page, pageSize: 100, source });
      if (result.items.some(r => records.some(p => p.id === r.id))) throw new Error('El historial cambió durante la consulta. Intenta nuevamente.');
      records.push(...result.items);
      if (records.length === result.total) return records;
      if (!result.items.length || records.length > result.total) throw new Error('No se pudo leer el historial completo de devoluciones.');
      page++;
    }
  }
  return {
    list: repository.list,
    get: repository.get,
    sources: sources.list,
    async balances(source: SaleSource) { return availability(source, await history(source)); },
    async save(draft: ReturnDraft, id: string): Promise<CustomerReturn> {
      if (!id) throw new Error('La solicitud requiere un identificador.');
      const errors = validateDraft(draft);
      if (errors.length) throw new Error(errors.join(' '));
      const previous = await repository.get(id);
      if (previous) {
        if (previous.status === 'SOLICITADA' && draftIdentity(previous) === draftIdentity(draft)) return previous;
        throw new Error('El identificador ya está registrado con otro contenido.');
      }
      const source = (await sources.list()).find(s => sameSource(s, draft.source));
      if (!source) throw new Error('El documento de origen ya no está disponible. El formulario se conserva.');
      // Revalidate against fresh originals, not client-edited historical amounts.
      const candidate = { ...draft, source };
      const changedErrors = validateDraft(candidate);
      if (changedErrors.length) throw new Error(`El documento original cambió o no es válido. ${changedErrors.join(' ')}`);
      const currentErrors = validateAvailability(candidate, await history(source));
      if (currentErrors.length) throw new Error(currentErrors.join(' '));
      return repository.save({ ...candidate, reason: draft.reason.trim(), notes: draft.notes.trim(), lines: draft.lines.map(l => ({ ...l, reason: l.reason.trim(), notes: l.notes.trim() })), id, createdAt: new Date().toISOString(), status: 'SOLICITADA' });
    },
  };
}
