import { useEffect, useRef, useState } from 'react';
import type { CustomerReturn, LineAvailability, ReturnDraft, ReturnQuery, ReturnStatus, SaleSource } from './types';
import { returnService } from './runtime';
import { sourceErrors, validateDraft } from './domain';
import { button, primary } from './ReturnLines';
import { Plus, RotateCcw, HardDrive, ClipboardList } from 'lucide-react';
import { ReturnDetailModal } from './ReturnDetailModal';
import { ReturnList } from './ReturnList';
import { ReturnEditor } from './ReturnEditor';
import { ReturnScopeInfo } from './ReturnUI';


const initialQuery: ReturnQuery = { search: '', customer: '', from: '', to: '', status: '', page: 1, pageSize: 10 };
const message = (e: unknown) => e instanceof Error ? e.message : 'Ocurrió un error. Intenta nuevamente.';
const sourceKey = (s: SaleSource) => `${s.origin}:${s.id}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

export function DevolucionesPage() {
  const [query, setQuery] = useState(initialQuery);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ items: CustomerReturn[]; total: number }>({ items: [], total: 0 });
  const [settled, setSettled] = useState<{ query: ReturnQuery; revision: number } | null>(null);
  const [statuses, setStatuses] = useState<ReturnStatus[]>([]);
  const [notice, setNotice] = useState('');
  const clearing = useRef(false);
  const [listError, setListError] = useState('');
  const [sources, setSources] = useState<SaleSource[]>([]);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [sourcesReady, setSourcesReady] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ReturnDraft | null>(null);
  const [review, setReview] = useState(false);
  const [detail, setDetail] = useState<CustomerReturn | null>(null);
  const [modalDetail, setModalDetail] = useState<{ request: CustomerReturn; trigger: HTMLElement } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [balances, setBalances] = useState<LineAvailability[]>([]);
  const [balanceSource, setBalanceSource] = useState<SaleSource | null>(null);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const [balanceError, setBalanceError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const draftId = useRef('');
  const loading = settled?.query !== query || settled?.revision !== revision;
  const balanceLoading = !!draft && balanceSource !== draft.source;
  const selectedSource = draft?.source;
  const hasUsableSources = sources.some(s => !sourceErrors(s).length);

  useEffect(() => {
    let active = true;
    returnService.sources().then(s => { if (active) { setSources(s); setSourceError(''); } }).catch(e => { if (active) setSourceError(message(e)); }).finally(() => { if (active) setSourcesReady(true); });
    return () => { active = false; };
  }, [sourceRevision]);
  useEffect(() => {
    let active = true;
    returnService.list(query).then(r => { if (active) { setResult(r); setListError(''); setNotice(clearing.current ? 'Filtros limpiados.' : ''); clearing.current = false; } }).catch(e => { if (active) { setResult({ items: [], total: 0 }); setListError(message(e)); clearing.current = false; } }).finally(() => { if (active) setSettled({ query, revision }); });
    return () => { active = false; };
  }, [query, revision]);
  useEffect(() => {
    let active = true;
    const supported: ReturnStatus[] = ['SOLICITADA', 'CONFIRMADA'];
    Promise.all(supported.map(status => returnService.list({ ...initialQuery, status, pageSize: 1 }))).then(results => { if (active) setStatuses(supported.filter((_,i) => results[i].total > 0)); }).catch(() => { /* The main list exposes read errors; do not invent status options. */ });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    if (!selectedSource) return;
    let active = true;
    returnService.balances(selectedSource).then(b => { if (active) { setBalances(b); setBalanceError(''); } }).catch(e => { if (active) setBalanceError(message(e)); }).finally(() => { if (active) setBalanceSource(selectedSource); });
    return () => { active = false; };
  }, [selectedSource, balanceRevision]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (editing) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing]);

  const filter = (patch: Partial<ReturnQuery>) => setQuery(q => ({ ...q, ...patch, page: 1 }));
  const update = (patch: Partial<ReturnDraft>) => { setDraft(d => d ? { ...d, ...patch } : d); setReview(false); setFormError(''); };
  function chooseSource(key: string) {
    if (draft?.lines.length && !window.confirm('Se reemplazarán los productos y cantidades del formulario. ¿Continuar?')) return;
    const source = sources.find(s => sourceKey(s) === key);
    setFormError(''); setBalanceError(''); setReview(false); setBalanceSource(null); setBalances([]);
    setDraft(source ? { source, receipt: source.receipts.length === 1 ? source.receipts[0] : undefined, date: today(), reason: '', notes: '', lines: [] } : null);
  }
  function preview() {
    if (!draft) { setFormError('Selecciona un documento de origen.'); return; }
    const errors = validateDraft(draft);
    if (balanceLoading || balanceError) errors.push('Debes consultar las devoluciones anteriores antes de guardar.');
    if (draft.lines.some(l => l.quantity > (balances.find(b => b.position === l.position)?.maximum ?? 0))) errors.push('Una cantidad supera lo disponible o su máximo de referencia.');
    if (errors.length) { setFormError([...new Set(errors)].join(' ')); return; }
    setFormError(''); setReview(true);
  }
  async function save() {
    if (!draft || !review || savingRef.current) return;
    savingRef.current = true; setSaving(true); setFormError('');
    try {
      const saved = await returnService.save(draft, draftId.current);
      setEditing(false); setDraft(null); setReview(false); setDetail(saved); setRevision(r => r + 1);
    } catch(e) { setFormError(message(e)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function close() {
    if (editing && !window.confirm('¿Descartar la solicitud sin guardar?')) return;
    setEditing(false); setDraft(null); setDetail(null); setReview(false); setFormError('');
  }
  function start() {
    draftId.current = crypto.randomUUID(); setEditing(true); setDraft(null); setReview(false); setFormError('');
  }
  function clearFilters() {
    clearing.current = true; setNotice(''); setQuery(q => ({ ...initialQuery, pageSize: q.pageSize })); setRevision(r => r + 1);
  }
  async function openDetail(id: string, trigger: HTMLElement) {
    setDetailLoading(true);
    try { const row = await returnService.get(id); if (!row) throw new Error('La solicitud ya no está disponible.'); setModalDetail({ request: row, trigger }); setListError(''); }
    catch(e) { setListError(message(e)); }
    finally { setDetailLoading(false); }
  }
  const canCreate = sourcesReady && !sourceError && hasUsableSources;
  return <section className="mx-auto min-w-0 max-w-[1600px] space-y-5 text-slate-800 dark:text-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-4 pb-1"><div className="flex min-w-0 items-start gap-3"><div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 sm:flex"><ClipboardList aria-hidden="true" size={24} /></div><div><h1 className="text-2xl font-bold tracking-tight">Devoluciones de clientes</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Consulta y registra solicitudes de devolución</p></div></div>{!editing && !detail && <button className={`${primary} inline-flex items-center gap-2`} disabled={!canCreate} onClick={start}><Plus aria-hidden="true" size={18} />Nueva solicitud</button>}</div>
    <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><HardDrive aria-hidden="true" size={13} />Los registros se guardan solo en este navegador.</p>
    {(!sourcesReady || sourceError || !hasUsableSources) && <div role={sourceError ? 'alert' : 'status'} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-300"><p>{!sourcesReady ? 'Cargando documentos de venta…' : sourceError || 'No hay ventas con productos disponibles. Revisa los documentos de origen.'}</p>{sourcesReady && <button className={`${button} inline-flex items-center gap-2`} onClick={() => { setSourcesReady(false); setSourceError(''); setSourceRevision(r => r + 1); }}><RotateCcw aria-hidden="true" size={14} />Reintentar documentos</button>}</div>}
    {editing || detail ? <ReturnEditor draft={draft} detail={detail} review={review} saving={saving} sources={sources} balances={balances} balanceLoading={balanceLoading} balanceError={balanceError} formError={formError} onClose={close} onSource={chooseSource} onUpdate={update} onPreview={preview} onSave={() => void save()} onEdit={() => { setReview(false); setFormError(''); }} onRetryHistory={() => { setBalanceSource(null); setBalanceError(''); setBalanceRevision(r => r + 1); }} /> : <ReturnList query={query} result={result} loading={loading} detailLoading={detailLoading} error={listError} statuses={statuses} notice={notice} canCreate={!!canCreate} onCreate={start} onFilter={filter} onPage={page => setQuery(q => ({ ...q, page }))} onClear={clearFilters} onRetry={() => setRevision(r => r + 1)} onDetail={(id, trigger) => void openDetail(id, trigger)} />}
    <ReturnScopeInfo />
    {modalDetail && <ReturnDetailModal request={modalDetail.request} trigger={modalDetail.trigger} onClose={() => setModalDetail(null)} />}
  </section>;
}
