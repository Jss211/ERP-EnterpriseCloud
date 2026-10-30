import { useEffect, useRef, useState } from 'react';
import type { Proveedor } from '../../../services/proveedoresService';
import type { Producto } from '../../../services/inventarioService';
import type { OrdenCompra } from '../../../services/comprasService';
import { invoiceMasters, invoiceService } from './service';
import type { Invoice, InvoiceDraft, InvoiceQuery } from './types';
import { calculateTotals } from './domain';
import { button, control, InvoiceLines } from './InvoiceLines';
import { draftFromOrder } from './orderRules';
import { SupplierFilter } from './SupplierFilter';
import { invoiceInternalId, INVOICE_STATUSES } from './types';
import { OrderInvoiceReview } from './OrderInvoiceReview';
const emptyDraft = (): InvoiceDraft => ({ supplierId: '', supplierName: '', supplierDocument: '', documentType: 'FACTURA', series: '', number: '', issuedAt: '', dueAt: '', currency: 'PEN', paymentDays: 0, notes: '', lines: [] });
const initialQuery: InvoiceQuery = { search: '', supplierId: '', currency: '', status: '', from: '', to: '', page: 1, pageSize: 10 };
const message = (e: unknown) => e instanceof Error ? e.message : 'Ocurrió un error. Intenta nuevamente.';
export function FacturasProveedoresPage() {
  const [suppliers, setSuppliers] = useState<readonly Proveedor[]>([]);
  const [products, setProducts] = useState<readonly Producto[]>([]);
  const [orders, setOrders] = useState<OrdenCompra[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<{ items: Invoice[]; total: number }>({ items: [], total: 0 });
  const [pendingEdit, setPendingEdit] = useState<Invoice | null>(null);
  const [pendingNotice, setPendingNotice] = useState('');
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [entryMode, setEntryMode] = useState<'order' | 'manual'>('manual');
  const [orderWarning, setOrderWarning] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [supplierError, setSupplierError] = useState('');
  const [masterRevision, setMasterRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const refreshPending = useRef(false);
  const [masterError, setMasterError] = useState('');
  const [settled, setSettled] = useState<{ query: InvoiceQuery; revision: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const savingRef = useRef(false);
  const draftId = useRef('');
  const loading = settled?.query !== query || settled?.revision !== revision;
  useEffect(() => {
    let active = true;
    invoiceMasters.suppliers().then(s => { if (active) setSuppliers(s); }).catch(e => { if (active) setSupplierError(message(e)); }).finally(() => { if (active) setSupplierLoading(false); });
    Promise.all([invoiceMasters.products(), invoiceMasters.orders()]).then(([p,o]) => {
      if (active) { setProducts(p); setOrders(o); if (!p.length) setMasterError('No hay proveedores o productos disponibles. Revisa los maestros y la conexión antes de registrar.'); }
    }).catch(e => { if (active) setMasterError(message(e)); });
    return () => { active = false; };
  }, [masterRevision]);
  useEffect(() => {
    let active = true;
    invoiceService.list(query).then(r => { if (active) { setResult(r); setError(''); setNotice(refreshPending.current ? 'Listado actualizado.' : ''); refreshPending.current = false; } }).catch(e => { if (active) { setResult({ items: [], total: 0 }); setError(message(e)); refreshPending.current = false; } }).finally(() => { if (active) setSettled({ query, revision }); });
    return () => { active = false; };
  }, [query, revision]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (draft) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  const invalidDates = !!(query.from && query.to && query.from > query.to);
  const hasFilters = !!(query.search.trim() || query.supplierId || query.currency || query.status || query.from || query.to);
  const refresh = () => { refreshPending.current = true; setNotice(''); setQuery(q => ({ ...initialQuery, pageSize: q.pageSize })); setRevision(r => r + 1); };
  const filter = (patch: Partial<InvoiceQuery>) => setQuery(q => ({ ...q, ...patch, page: 1 }));
  const update = (patch: Partial<InvoiceDraft>) => setDraft(d => d ? { ...d, ...patch } : d);
  const confirmReplace = () => !draft?.lines.length || window.confirm('Se reemplazarán las líneas actuales, incluidas las cantidades y precios editados. ¿Continuar?');
  function startRegistration(mode: 'order' | 'manual') {
    setPendingEdit(null); setPendingNotice('');
    draftId.current = crypto.randomUUID(); setEntryMode(mode); setError(''); setOrderWarning(''); setDraft(emptyDraft());
  }
  function selectSupplier(id: string) {
    if (!draft || !confirmReplace()) return;
    const supplier = suppliers.find(s => s.id === id);
    setOrderWarning('');
    update({ supplierId: id, supplierName: supplier?.nombre ?? '', supplierDocument: supplier?.documento ?? '', paymentDays: supplier?.condicion_pago ?? 0, orderId: undefined, orderCode: undefined, lines: [] });
  }
  function selectOrder(id: string) {
    if (!draft || id === draft.orderId || !confirmReplace()) return;
    const order = orders.find(o => o.id === id && (entryMode === 'order' || o.proveedor_id === draft.supplierId));
    if (!order) { setOrderWarning(''); update({ orderId: undefined, orderCode: undefined, lines: [] }); return; }
    try {
      const loaded = draftFromOrder(draft, order, suppliers, products);
      setDraft(loaded.draft); setOrderWarning(loaded.warning); setError('');
    } catch (e) { setError(message(e)); }
  }
  async function save(keepPending = false) {
    if (!draft || savingRef.current) return;
    if (entryMode === 'order' && !draft.orderId) { setError('Selecciona una orden de compra.'); return; }
    savingRef.current = true; setSaving(true); setError('');
    try { const saved = await invoiceService.save(draft, draftId.current, pendingEdit ? { pending: keepPending, expectedRevision: pendingEdit.revision ?? 0 } : undefined); if (keepPending) { setPendingEdit(saved); setDraft(saved); setPendingNotice('Pendiente guardado.'); } else { setDraft(null); setPendingEdit(null); setDetail(saved); } setRevision(r => r + 1); }
    catch (e) { setError(message(e)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const totals = draft ? calculateTotals(draft.lines) : detail?.totals;
  const current = draft ?? detail;
  return <section className="space-y-5 text-slate-800 dark:text-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Facturas de proveedores</h1><p className="text-sm text-slate-500 dark:text-slate-400">Registros guardados únicamente en este navegador.</p></div>{!current && <div className="flex flex-wrap gap-2"><button className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-40" disabled={supplierLoading || !!supplierError || !suppliers.length || !products.length} onClick={() => startRegistration('order')}>Registrar desde una orden</button><button className={button} disabled={supplierLoading || !!supplierError || !suppliers.length || !products.length} onClick={() => startRegistration('manual')}>Registrar sin orden</button></div>}</div>
    {notice && !current && !loading && !error && <p role="status" className="text-green-700 dark:text-green-300">{notice}</p>}
    {masterError && <p role="status" className="text-amber-600 dark:text-amber-400">{masterError}</p>}
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-200">{error}{!current && <button className={button} onClick={() => { refreshPending.current = true; setRevision(r => r + 1); }}>Reintentar lectura</button>}</div>}
    {current ? <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-semibold">{draft ? pendingEdit ? `Completar referencia ${invoiceInternalId(pendingEdit)}` : 'Registrar factura' : `Factura ${detail!.series}-${detail!.number} · ${detail!.status}`}</h2><button disabled={saving} className={button} onClick={() => { if (draft && !window.confirm('¿Descartar el formulario sin guardar?')) return; setDraft(null); setPendingEdit(null); setDetail(null); setError(''); }}>Volver al listado</button></div>
      {pendingEdit && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">Pendiente de completar. Esta es una referencia interna de la orden, no una factura emitida por el proveedor ni validada ante SUNAT. Completa y revisa los datos del documento real antes de registrarla.</p>}
      {pendingNotice && pendingEdit && <p role="status">{pendingNotice}</p>}
      {draft ? <form id="supplier-invoice-form" onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-4"><fieldset disabled={saving} className="min-w-0 space-y-4">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>label]:min-w-0">
          <label>{entryMode === 'order' ? 'Orden de compra *' : 'Orden de compra (opcional)'}<select required={entryMode === 'order'} className={control} disabled={!!pendingEdit || (entryMode === 'manual' && !draft.supplierId)} value={draft.orderId ?? ''} onChange={e => selectOrder(e.target.value)}><option value="">{entryMode === 'order' ? 'Seleccionar una orden disponible' : 'Sin orden'}</option>{orders.filter(o => (entryMode === 'order' || o.proveedor_id === draft.supplierId) && o.estado !== 'ANULADA').map(o => {
            const available = suppliers.some(s => s.id === o.proveedor_id) && ['PEN', 'USD'].includes(o.moneda);
            return <option key={o.id} value={o.id} disabled={!available}>{o.codigo} · {o.proveedor_nombre} · {o.moneda}{!available ? ' · Revisar proveedor por ID o moneda' : ''}</option>;
          })}</select>{entryMode === 'order' && !orders.some(o => o.estado !== 'ANULADA' && suppliers.some(s => s.id === o.proveedor_id) && ['PEN', 'USD'].includes(o.moneda)) && <span className="block text-xs text-amber-700 dark:text-amber-300">No hay órdenes disponibles con proveedor por ID y moneda compatibles. Puedes volver y registrar sin orden.</span>}</label>
          <label>Proveedor *<select required disabled={entryMode === 'order'} className={control} value={draft.supplierId} onChange={e => selectSupplier(e.target.value)}><option value="">{entryMode === 'order' ? 'Se completa desde la orden' : 'Seleccionar proveedor'}</option>{suppliers.map(s => <option value={s.id} key={s.id}>{s.nombre} · {s.documento}</option>)}</select></label>
          <label>Tipo documental<input className={control} value="FACTURA" readOnly /></label>
          <label>Serie *<input required maxLength={20} className={control} value={draft.series} onChange={e => update({ series: e.target.value })} /></label>
          <label>Número *<input required maxLength={20} inputMode="numeric" className={control} value={draft.number} onChange={e => update({ number: e.target.value })} /></label>
          <label>Moneda *<select className={control} value={draft.currency} onChange={e => update({ currency: e.target.value as 'PEN' | 'USD' })}><option>PEN</option><option>USD</option></select></label>
          <label>Emisión *<input required type="date" className={control} value={draft.issuedAt} onChange={e => update({ issuedAt: e.target.value })} /></label>
          <label>Vencimiento *<input required type="date" min={draft.issuedAt} className={control} value={draft.dueAt} onChange={e => update({ dueAt: e.target.value })} /></label>
          <label>Condición de pago (días; 0 contado) *<input required type="number" min="0" step="1" className={control} value={Number.isNaN(draft.paymentDays) ? '' : draft.paymentDays} onChange={e => update({ paymentDays: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">La orden propone cantidades y precios para revisión. Ajústalos según la factura real, incluida una factura parcial. Lo pedido, recibido y facturado puede ser diferente. Ingresa las fechas del comprobante recibido.</p>
        {orderWarning && <p role="status" className="text-amber-700 dark:text-amber-300">{orderWarning}</p>}
        <label className="block">Agregar producto<select className={control} value="" onChange={e => { const p = products.find(item => item.id === e.target.value); if (p) update({ lines: [...draft.lines, { id: crypto.randomUUID(), productId: p.id, code: p.codigo, description: p.descripcion, unit: p.unidad, quantity: 1, price: p.costoUnitario, discount: 0, tax: 18 }] }); }}><option value="">Seleccionar producto</option>{products.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</option>)}</select></label>
        <InvoiceLines lines={draft.lines} onChange={lines => update({ lines })} />
        <label className="block">Observaciones<textarea maxLength={4000} className={control} value={draft.notes} onChange={e => update({ notes: e.target.value })} /></label>
      </fieldset></form> : <>
        <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt>Proveedor</dt><dd>{detail!.supplierName} · {detail!.supplierDocument}</dd><dd className="break-all text-xs text-slate-500">ID: {detail!.supplierId}</dd></div><div><dt>Orden de compra</dt><dd>{detail!.orderCode ?? 'Sin orden'} <span className="break-all">{detail!.orderId ? `(${detail!.orderId})` : ''}</span></dd></div><div><dt>Emisión / Vencimiento</dt><dd>{detail!.issuedAt} / {detail!.dueAt}</dd></div><div><dt>Moneda / Condición</dt><dd>{detail!.currency} / {detail!.paymentDays === 0 ? 'Contado' : `${detail!.paymentDays} días`}</dd></div><div><dt>Registro</dt><dd className="break-all">{detail!.id}</dd><dd>{new Date(detail!.createdAt).toLocaleString('es-PE')}</dd></div></dl>
        <InvoiceLines lines={detail!.lines} />
        <details className="text-sm"><summary>Referencias de líneas</summary>{detail!.lines.map(l => <p className="break-all" key={l.id}>{l.code}: producto {l.productId} · línea {l.id}{l.orderLineId ? ` · línea de orden ${l.orderLineId}` : ''}</p>)}</details>
        <p className="whitespace-pre-wrap">{detail!.notes || 'Sin observaciones'}</p>
      </>}
      {current.orderId && <OrderInvoiceReview orderId={current.orderId} order={orders.find(o => o.id === current.orderId)} lines={current.lines} revision={revision} editing={!!draft} />}
      {current.orderDiscountAmount !== undefined && <p className="text-sm text-slate-500 dark:text-slate-400">Descuento global de la orden (referencia): {current.currency} {current.orderDiscountAmount.toFixed(2)}. No se distribuye autom?ticamente entre las l?neas; registra los descuentos reales de la factura.</p>}
      {detail && <p className="break-all text-sm">Identificador interno: {invoiceInternalId(detail)}</p>}
      {totals && <div className="space-y-1 text-right"><p>Base después de descuentos: {current.currency} {totals.base.toFixed(2)}</p><p>Impuestos: {totals.tax.toFixed(2)}</p><p className="text-xl font-bold">Total: {current.currency} {totals.total.toFixed(2)}</p></div>}
      <p className="text-xs text-slate-500 dark:text-slate-400">Adjuntos pendientes de almacenamiento. Integración con cuentas por pagar y Tesorería pendiente.</p>
      {pendingEdit && draft && <button type="button" disabled={saving} className={button} onClick={() => void save(true)}>Guardar pendiente</button>}
      {draft && <button form="supplier-invoice-form" type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-40">{saving ? 'Guardando…' : 'Guardar factura'}</button>}
    </div> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>Buscar<input className={control} placeholder="Identificador interno, orden, factura o proveedor" value={query.search} onChange={e => filter({ search: e.target.value })} /></label>
        <SupplierFilter key={revision} suppliers={suppliers} value={query.supplierId} onChange={supplierId => filter({ supplierId })} loading={supplierLoading} error={supplierError} retry={() => { setSupplierLoading(true); setSupplierError(''); setMasterError(''); setMasterRevision(r => r + 1); }} />
        <label>Moneda<select className={control} value={query.currency} onChange={e => filter({ currency: e.target.value })}><option value="">Todas</option><option>PEN</option><option>USD</option></select></label>
        {INVOICE_STATUSES.length > 1 && <label>Estado documental<select className={control} value={query.status} onChange={e => filter({ status: e.target.value })}><option value="">Todos</option>{INVOICE_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>}
        <label>Emisión desde<input type="date" className={control} value={query.from} onChange={e => filter({ from: e.target.value })} /></label>
        <label>Emisión hasta<input type="date" className={control} value={query.to} onChange={e => filter({ to: e.target.value })} /></label>
        <label>Por página<select className={control} value={query.pageSize} onChange={e => filter({ pageSize: Number(e.target.value) })}>{[10,25,50].map(n => <option key={n}>{n}</option>)}</select></label><button className={button} onClick={refresh}>Limpiar / actualizar</button>
      </div>
      {detailLoading && <p role="status">Cargando detalle…</p>}
      {invalidDates && <p role="alert" className="text-amber-700 dark:text-amber-300">Emisión desde no puede ser posterior a Emisión hasta.</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><table className="w-full text-left text-sm"><thead><tr>{['Identificador interno', 'Orden de compra', 'Proveedor', 'Serie y número', 'Emisión', 'Vencimiento', 'Moneda', 'Total', 'Estado documental', 'Acciones'].map(h => <th key={h} className="whitespace-nowrap p-3">{h}</th>)}</tr></thead><tbody>{!loading && !error && !invalidDates && result.items.map(r => <tr key={r.id} className="border-t border-slate-200 dark:border-slate-800"><td className="max-w-52 break-all p-3">{invoiceInternalId(r)}</td><td className="p-3">{r.orderCode ?? r.orderId ?? 'Sin orden'}</td><td className="p-3">{r.supplierName}</td><td className="p-3">{r.series || r.number ? `${r.series || 'Pendiente'}-${r.number || 'Pendiente'}` : 'Pendiente'}</td><td className="p-3">{r.issuedAt || 'Pendiente'}</td><td className="p-3">{r.dueAt || 'Pendiente'}</td><td className="p-3">{r.currency}</td><td className="p-3">{r.totals.total.toFixed(2)}</td><td className="p-3">{INVOICE_STATUSES.find(s => s.value === r.status)?.label ?? r.status}</td><td className="p-3"><button className={button} disabled={detailLoading} onClick={async () => { setDetailLoading(true); try { const row = await invoiceService.get(r.id); if (row.status === 'PENDIENTE') { setPendingEdit(row); setPendingNotice(''); draftId.current = row.id; setEntryMode('order'); setDraft(row); setDetail(null); } else setDetail(row); setError(''); } catch(e) { setError(message(e)); } finally { setDetailLoading(false); } }}>{r.status === 'PENDIENTE' ? 'Completar' : 'Ver detalle'}</button></td></tr>)}</tbody></table><p role="status" className="p-3 text-sm text-slate-500">{loading ? 'Cargando…' : error ? 'No se pudo cargar el listado.' : invalidDates ? 'Corrige el rango de fechas.' : `${result.total} registros`}</p></div>
      {!loading && !error && !invalidDates && result.total === 0 && <p role="status">{hasFilters ? 'No hay facturas que coincidan con los filtros.' : 'Aún no hay facturas registradas.'}</p>}
      <div className="flex items-center justify-end gap-3"><button className={button} disabled={loading || !!error || invalidDates || query.page <= 1} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))}>Anterior</button><span>Página {query.page} de {Math.max(1, Math.ceil(result.total / query.pageSize))}</span><button className={button} disabled={loading || !!error || invalidDates || query.page * query.pageSize >= result.total} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))}>Siguiente</button></div>
    </>}
  </section>;
}
