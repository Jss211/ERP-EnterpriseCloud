import React, { useState, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Printer, Search, FileBarChart, Coins, CheckCircle2 } from 'lucide-react';
import { treasuryService } from '../tesoreria/runtime';
import { toStatementItem } from '../tesoreria/receivableCompatibility';
import type { Currency, MoneyAccount, Obligation } from '../tesoreria/types';
import { OperationForm } from '../tesoreria/OperationForm';
import { FinancialDetail } from '../tesoreria/FinancialDetail';
import { addMinor, documentMinor } from '../tesoreria/money';
import { Loading, TreasuryError } from '../tesoreria/TreasuryUI';
import { button, control } from '../tesoreria/styles';

export interface ItemEstadoCuenta {
  moneda?: Currency; vencimiento?: string; vencido?: boolean; bloqueo?: string; documentoAnulado?: boolean; obligation?: Obligation;
  id?: string;
  dbId?: string;
  tipo: string;
  fecha: string;
  rawFecha?: string;
  nro: string;
  razonSocial: string;
  productos: string;
  metodoPago: string;
  estado: string;
  total: number;
  saldo: number;
  pagado: number;
}

export const EstadoCuentaPage: React.FC = () => {
  const { darkMode } = useOutletContext<{ darkMode: boolean }>();
  
  const [filterText, setFilterText] = useState('');
  const [dateStart, setDateStart] = useState('2026-01-01');
  const [dateEnd, setDateEnd] = useState('2026-12-31');
  const [allData, setAllData] = useState<ItemEstadoCuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [consultFeedback, setConsultFeedback] = useState<string | null>(null);

  const [cobroModalItem, setCobroModalItem] = useState<ItemEstadoCuenta | null>(null);
  const [accounts,setAccounts]=useState<MoneyAccount[]>([]);
  const [documents,setDocuments]=useState<Obligation[]>([]);
  const [detail,setDetail]=useState<Obligation|null>(null);
  const [operationId,setOperationId]=useState('');
  const [revision,setRevision]=useState(0);
  const [loadError,setLoadError]=useState('');
  const [reportDate]=useState(()=>new Date().toLocaleDateString());
  const [statusFilter,setStatusFilter]=useState('');
  const [toastMessage,setToastMessage]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try {
        const view=await treasuryService.workspace({page:1,pageSize:100},'COBRAR');
        const rows=view.documents,state=view.state;
        if(active){setDocuments(rows);setAccounts(state.accounts);setAllData(rows.map(o=>toStatementItem(o,[...state.operations].reverse().find(op=>op.obligationId===o.id&&!op.cancellation)?.method)));setLoadError('');}
      }catch(e){if(active)setLoadError(e instanceof Error?e.message:'No se pudo leer el estado de cuenta.');}
      finally{if(active)setLoading(false);}
    };
    void load();return()=>{active=false;};
  },[revision]);
  const reload=()=>{setLoading(true);setRevision(n=>n+1);};
  const handleOpenCobroModal=(item:ItemEstadoCuenta)=>{if(item.bloqueo||item.documentoAnulado){setToastMessage(item.bloqueo||'Documento anulado.');return;}setCobroModalItem(item);};

  // Filtramos la data en tiempo real
  const filteredData = useMemo(() => {
    return allData.filter(d => {
      const matchText = 
        d.razonSocial.toLowerCase().includes(filterText.toLowerCase().trim()) ||
        d.nro.toLowerCase().includes(filterText.toLowerCase().trim()) ||
        d.metodoPago.toLowerCase().includes(filterText.toLowerCase().trim()) ||
        d.productos.toLowerCase().includes(filterText.toLowerCase().trim());

      if (!matchText || (statusFilter && d.estado !== statusFilter)) return false;
      if (dateStart && dateEnd && dateStart > dateEnd) return false;

      if (dateStart && d.rawFecha) {
        const itemDate = d.rawFecha.slice(0, 10);
        if (itemDate < dateStart) return false;
      }
      if (dateEnd && d.rawFecha) {
        const itemDate = d.rawFecha.slice(0, 10);
        if (itemDate > dateEnd) return false;
      }

      return true;
    });
  }, [allData, filterText, dateStart, dateEnd,statusFilter]);

  // Agrupamos por tipo de documento
  const groupedData = useMemo(() => {
    const groups: Record<string, ItemEstadoCuenta[]> = {};
    filteredData.forEach(item => {
      const group = `${item.tipo} ? ${item.moneda}`;
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    });
    return groups;
  }, [filteredData]);

  const formatCurrency = (val: number) => val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const exportToCSV = () => {
    const headers = ['Tipo', 'Moneda', 'Fecha Venta', 'Nro Documento', 'Razón Social', 'Detalle de Productos', 'Forma de Pago', 'Estado', 'Total', 'Saldo', 'Cobrado'];
    let csvContent = headers.join(';') + '\n';
    
    filteredData.forEach(item => {
      const row = [
        item.tipo,
        item.moneda,
        item.fecha,
        item.nro,
        `"${item.razonSocial}"`,
        `"${item.productos}"`,
        item.metodoPago,
        item.estado,
        item.total,
        item.saldo,
        item.pagado
      ];
      csvContent += row.join(';') + '\n';
    });

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'estado_de_cuenta_ventas.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if ((loading || loadError) && !cobroModalItem && !detail && !operationId) return <section className="text-slate-800 dark:text-slate-100"><h1 className="text-2xl font-bold">Estado de cuenta de ventas</h1>{loading?<Loading/>:<TreasuryError error={loadError} retry={reload}/>}</section>;
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1400px] mx-auto pb-10 font-sans print:p-0 print:m-0 print:w-full"
    >
      <style>
        {`
          @media print {
            @page { size: landscape; margin: 10mm; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        `}
      </style>
      
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400 print:hidden">Tesorer?a local ? Operaciones nuevas guardadas solo en este navegador. Los cobros hist?ricos sin cuenta no generan movimientos retroactivos.</p>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 mt-2 print:hidden">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mb-1.5 text-blue-500">
            <span>ERP</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span>VENTAS</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span>COBRANZAS</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span className="text-gray-400 dark:text-slate-500">ESTADO DE CUENTA</span>
          </div>
          <h1 className={`text-[26px] font-bold tracking-tight leading-none ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>
            Estado de cuenta de ventas
          </h1>
          <p className={`mt-2 text-[13px] ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Sistema de control de ventas: revisa la deuda por tipo de documento y gestiona los pagos.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={exportToCSV}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors border shadow-sm ${
              darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Download size={16} />
            Exportar CSV
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors bg-[#0ea5e9] hover:bg-[#0284c7] text-white shadow-sm"
          >
            <Printer size={16} />
            Imprimir
          </button>
        </div>
      </div>

      <div className="hidden print:block mb-6">
        <h2 className="text-2xl font-bold mb-1">Estado de cuenta de ventas</h2>
        <p className="text-sm text-gray-600">Reporte generado el {reportDate}</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        
        {/* TABLA PRINCIPAL (Izquierda) */}
        <div className={`flex-1 w-full rounded-2xl border shadow-sm overflow-hidden ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
        } print:border-none print:shadow-none print:w-full print:rounded-none`}>
          
          <div className={`p-6 border-b print:hidden ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                darkMode ? 'bg-[#0ea5e9]/20 text-[#38bdf8]' : 'bg-[#e0f2fe] text-[#0284c7]'
              }`}>
                01
              </div>
              <div>
                <h2 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Detalle del estado de cuenta
                </h2>
                <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                  {filteredData.length} documentos • Clic en una fila para gestionar pagos
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto print:overflow-visible print:w-full">
            <table className="w-full text-left text-[11px] border-separate border-spacing-y-2 print:border-spacing-y-0 print:border-collapse print:text-xs">
              <thead>
                <tr className={`text-[9px] uppercase tracking-wider font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'} print:text-black print:border-b print:border-black`}>
                  <th className="px-3 py-2 first:rounded-l-lg">Fecha Venta</th>
                  <th className="px-3 py-2">Nro Documento</th>
                  <th className="px-3 py-2">Razón Social</th>
                  <th className="px-3 py-2">Detalle de Productos</th>
                  <th className="px-3 py-2">Forma de Pago</th>
                  <th className="px-3 py-2 text-center">Estado</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                  <th className="px-3 py-2 text-right">Cobrado</th>
                  <th className="px-3 py-2 text-center last:rounded-r-lg print:hidden">Acción</th>
                </tr>
              </thead>
              
              {loading ? (
                <tbody>
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-8 h-8 border-4 border-[#0ea5e9] border-t-transparent rounded-full animate-spin mb-3"></div>
                        <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                          Cargando documentos de ventas desde Supabase...
                        </p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              ) : Object.keys(groupedData).length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={10} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                        <FileBarChart size={38} className="mb-3 text-slate-400 opacity-60" />
                        <h4 className={`text-sm font-bold mb-1 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                          {filterText ? `No se encontraron documentos para "${filterText}"` : 'No se encontraron documentos'}
                        </h4>
                        <p className={`text-xs leading-relaxed mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                          {filterText 
                            ? 'Verifica que el nombre o documento corresponda a un Cliente con ventas facturadas en el rango de fechas seleccionado.'
                            : 'Genera una orden en "Ventas > Orden de venta" y emite el comprobante en "Facturación" para visualizar el estado de cuenta aquí.'}
                        </p>
                        <div className={`p-3 rounded-xl border text-[11px] text-left leading-relaxed ${
                          darkMode ? 'bg-slate-800/60 border-slate-700 text-slate-300' : 'bg-blue-50/70 border-blue-200 text-blue-900'
                        }`}>
                          <p className="font-semibold mb-1">💡 ¿Buscabas un Proveedor?</p>
                          <p>
                            Los proveedores registrados (como Jordan Rojas) pertenecen al flujo de <strong>Compras</strong>. Para consultar sus datos u órdenes dirígete a <strong>Compras &gt; Orden de Compra</strong>. Si deseas registrar ventas a nombre de Jordan, debes darlo de alta en <strong>Ventas &gt; Clientes</strong>.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              ) : (
                Object.entries(groupedData).map(([tipo, items]) => {
                  const totalMonto = items.filter(item=>!item.documentoAnulado).reduce((acc, curr) => addMinor(acc, documentMinor(curr.total)), 0) / 100;
                  const totalSaldo = items.filter(item=>!item.documentoAnulado).reduce((acc, curr) => addMinor(acc, documentMinor(curr.saldo)), 0) / 100;
                  const totalPagado = items.filter(item=>!item.documentoAnulado).reduce((acc, curr) => addMinor(acc, documentMinor(curr.pagado)), 0) / 100;
                  
                  return (
                    <tbody key={tipo} className="print:divide-y print:divide-gray-400">
                      <tr>
                        <td colSpan={10} className="p-0 pt-3 print:pt-0">
                          <div className={`mb-1 px-3 py-2 rounded-xl flex items-center gap-2 ${
                            darkMode ? 'bg-indigo-900/30 border border-indigo-500/20' : 'bg-indigo-50 border border-indigo-100/50'
                          } print:bg-transparent print:border-b-2 print:border-black print:rounded-none print:px-0`}>
                            <FileBarChart className={`w-4 h-4 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'} print:hidden`} />
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${
                              darkMode ? 'text-indigo-300' : 'text-indigo-700'
                            } print:text-black`}>
                              TIPO DE DOCUMENTO: {tipo}
                            </span>
                          </div>
                        </td>
                      </tr>
                      
                      {items.map((item, idx) => (
                        <tr key={idx} className={`group transition-all ${
                          darkMode ? 'bg-slate-800/40 hover:bg-slate-800' : 'bg-white hover:bg-slate-50 shadow-sm ring-1 ring-slate-900/5'
                        } print:shadow-none print:ring-0`}>
                          <td className={`px-3 py-2.5 rounded-l-xl print:rounded-none font-semibold print:text-black whitespace-nowrap ${
                            darkMode ? 'text-slate-300' : 'text-slate-700'
                          }`}>
                            {item.fecha}<small className="mt-1 block text-slate-500">Vence: {item.vencimiento || 'No disponible'}</small>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap ${
                              darkMode ? 'bg-[#0ea5e9]/20 text-[#38bdf8]' : 'bg-[#e0f2fe] text-[#0284c7]'
                            } print:bg-transparent print:text-black`}>
                              {item.nro}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold print:hidden ${
                                darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {item.razonSocial.charAt(0)}
                              </div>
                              <span className={`font-semibold text-[11px] truncate max-w-[150px] ${darkMode ? 'text-white' : 'text-slate-900'} print:text-black`}>
                                {item.razonSocial}
                              </span>
                            </div>
                          </td>
                          <td className={`px-3 py-2.5 whitespace-normal max-w-[200px] text-[10px] leading-relaxed font-medium print:text-black ${
                            darkMode ? 'text-slate-300' : 'text-slate-900'
                          }`}>
                            {item.productos}
                          </td>
                          <td className={`px-3 py-2.5 font-semibold text-xs print:text-black whitespace-nowrap ${
                            darkMode ? 'text-slate-300' : 'text-slate-700'
                          }`}>
                            {item.metodoPago}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase whitespace-nowrap ${
                              item.estado === 'PAGADA'
                                ? darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                                : darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-700'
                            } print:bg-transparent print:text-black`}>
                              <span className={`w-1 h-1 rounded-full print:hidden ${
                                item.estado === 'PAGADA' ? 'bg-emerald-500' : 'bg-orange-500'
                              }`}></span>
                              {item.estado}
                            </span><p className="mt-1 text-[10px] text-slate-500">{item.vencido ? 'Vencido con saldo' : item.vencimiento ? 'Vencimiento: ' + item.vencimiento : 'Sin fecha de vencimiento'}</p>{item.bloqueo && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">{item.bloqueo}</p>}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${darkMode ? 'text-white' : 'text-slate-800'} print:text-black`}>
                            {item.moneda} {formatCurrency(item.total)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${
                            item.saldo > 0 ? (darkMode ? 'text-orange-400' : 'text-orange-600') : (darkMode ? 'text-slate-500' : 'text-slate-400')
                          } print:text-black`}>
                            {item.moneda} {formatCurrency(item.saldo)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${
                            item.pagado > 0 ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : (darkMode ? 'text-slate-500' : 'text-slate-400')
                          } print:text-black`}>
                            {item.moneda} {formatCurrency(item.pagado)}
                          </td>
                          <td className="px-3 py-2.5 text-center rounded-r-xl print:rounded-none print:hidden whitespace-nowrap">
                            <button type="button" className={`${button} mr-2`} onClick={()=>item.obligation&&setDetail(item.obligation)}>Ver detalle</button>
                            {item.saldo > 0 || item.estado === 'PENDIENTE' ? (
                              <button
                                disabled={!!item.bloqueo||item.documentoAnulado} onClick={() => handleOpenCobroModal(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                title="Registrar cobro de este documento"
                              >
                                <Coins size={13} />
                                Cobrar
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 size={13} />
                                Cobrado
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      
                      <tr>
                        <td colSpan={6} className={`px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-slate-500' : 'text-slate-400'} print:text-black`}>
                          TOTAL {tipo}
                        </td>
                        <td className={`px-3 py-3 text-right font-bold text-xs ${darkMode ? 'text-white' : 'text-slate-800'} print:text-black`}>{formatCurrency(totalMonto)}</td>
                        <td className={`px-3 py-3 text-right font-bold text-xs ${darkMode ? 'text-orange-400' : 'text-orange-600'} print:text-black`}>{formatCurrency(totalSaldo)}</td>
                        <td className={`px-3 py-3 text-right font-bold text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-600'} print:text-black`}>{formatCurrency(totalPagado)}</td>
                        <td className="print:hidden"></td>
                      </tr>
                    </tbody>
                  );
                })
              )}
            </table>
          </div>
        </div>

        {/* SIDEBAR DERECHO (Filtros y Totales) - Se ocultan los filtros al imprimir, pero el resumen se muestra abajo */}
        <div className="w-full lg:w-[350px] space-y-6">
          
          {/* Box de Filtros */}
          <div className={`rounded-2xl border shadow-sm p-6 print:hidden ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
          }`}>
            <h3 className={`font-bold mb-1 ${darkMode ? 'text-white' : 'text-slate-800'}`}>Filtros de búsqueda</h3>
            <p className={`text-xs mb-4 ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>Selecciona el rango de fechas o busca texto</p>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-[10px] font-bold tracking-wider uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Filtrar por
                </label>
                <div className="relative">
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} size={16} />
                  <input 
                    type="text" 
                    placeholder="Cliente, documento o forma de pago"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // Enter search logic (optional now since it's real-time)
                      }
                    }}
                    className={`w-full pl-9 pr-3 py-2.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/50 ${
                      darkMode ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-600' : 'bg-white border-gray-300 text-slate-800 placeholder-gray-400'
                    }`}
                  />
                </div>
              </div>
              
              <label className="block text-sm">Estado de pago<select className={control} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Todos</option><option>PENDIENTE</option><option>PARCIAL</option><option>PAGADA</option></select></label>
              <button className={button} onClick={reload}>Actualizar documentos</button>
              {dateStart && dateEnd && dateStart > dateEnd && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">La fecha inicial no puede superar la final.</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-bold tracking-wider uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    Fecha de Inicio
                  </label>
                  <input 
                    type="date"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-lg border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/50 ${
                      darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-gray-300 text-slate-800'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-bold tracking-wider uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    Fecha de Fin
                  </label>
                  <input 
                    type="date"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-lg border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/50 ${
                      darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-gray-300 text-slate-800'
                    }`}
                  />
                </div>
              </div>
              
              <button 
                onClick={() => {
                  const count = filteredData.length;
                  if (filterText.trim()) {
                    setConsultFeedback(`Consulta: ${count} documento(s) para "${filterText}".`);
                  } else {
                    setConsultFeedback(`Consulta: ${count} documento(s) en el período actual.`);
                  }
                  setTimeout(() => setConsultFeedback(null), 4000);
                }}
                className="w-full mt-2 bg-[#0ea5e9] hover:bg-[#0284c7] text-white py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm active:scale-[0.98]"
              >
                Consultar
              </button>

              {consultFeedback && (
                <div className={`text-xs p-2.5 rounded-lg border text-center transition-all ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-sky-400' : 'bg-sky-50 border-sky-200 text-sky-800'
                }`}>
                  {consultFeedback}
                </div>
              )}
            </div>
          </div>

          {/* Box de Resumen */}
          <div className={`rounded-2xl border shadow-sm p-6 print:mt-10 print:border-none print:shadow-none print:w-full print:p-0 ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
          }`}>
            <h3 className={`font-bold mb-1 ${darkMode ? 'text-white' : 'text-slate-800'} print:text-xl print:mb-3`}>Resumen del Cliente</h3>
            <p className={`text-xs mb-6 ${darkMode ? 'text-slate-500' : 'text-gray-500'} print:hidden`}>Totales y detalle de productos</p>
            
            <div className="space-y-6 print:grid print:grid-cols-2 print:gap-8 print:space-y-0">
              {Object.entries(groupedData).map(([tipo, items]) => {
                const totalMonto = items.filter(item=>!item.documentoAnulado).reduce((acc, curr) => addMinor(acc, documentMinor(curr.total)), 0) / 100;
                const totalSaldo = items.filter(item=>!item.documentoAnulado).reduce((acc, curr) => addMinor(acc, documentMinor(curr.saldo)), 0) / 100;
                const totalPagado = items.filter(item=>!item.documentoAnulado).reduce((acc, curr) => addMinor(acc, documentMinor(curr.pagado)), 0) / 100;
                
                return (
                  <div key={tipo} className={`pb-4 border-b last:border-0 last:pb-0 ${darkMode ? 'border-slate-800' : 'border-gray-100'} print:border-b-0 print:border-l-4 print:border-black print:pl-4 print:pb-0`}>
                    <p className={`text-[11px] font-bold tracking-widest uppercase mb-3 ${darkMode ? 'text-[#38bdf8]' : 'text-[#0ea5e9]'} print:text-black print:text-sm`}>
                      {tipo}
                    </p>

                    {/* Detalle de compras (solo visible al filtrar) */}
                    {filterText.trim() !== '' && (
                      <div className={`mb-4 rounded-lg p-3 border ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-gray-100'} print:bg-transparent print:border-black`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'} print:text-black`}>
                          Detalle de compras:
                        </p>
                        <ul className="space-y-3">
                          {items.map((item, idx) => (
                            <li key={idx} className="flex flex-col gap-0.5">
                              <div className="flex justify-between items-center">
                                <span className={`text-[11px] font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'} print:text-black`}>{item.nro}</span>
                                <span className={`text-[11px] font-bold ${darkMode ? 'text-[#38bdf8]' : 'text-[#0ea5e9]'} print:text-black`}>{item.moneda} {formatCurrency(item.total)}</span>
                              </div>
                              <span className={`text-[11px] leading-relaxed ${darkMode ? 'text-slate-400' : 'text-gray-500'} print:text-black`}>
                                {item.productos}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="space-y-1.5 text-sm print:text-base">
                      <div className={`flex justify-between ${darkMode ? 'text-slate-300' : 'text-slate-600'} print:text-black`}>
                        <span>Total:</span>
                        <span className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'} print:text-black`}>{formatCurrency(totalMonto)}</span>
                      </div>
                      <div className={`flex justify-between ${darkMode ? 'text-emerald-400' : 'text-emerald-600'} print:text-black`}>
                        <span>Pagado:</span>
                        <span className="font-medium">{formatCurrency(totalPagado)}</span>
                      </div>
                      <div className={`flex justify-between font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'} print:text-black`}>
                        <span>Saldo:</span>
                        <span>{formatCurrency(totalSaldo)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          

          
          
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl border border-emerald-500 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 size={18} />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {cobroModalItem?.obligation && <OperationForm kind="COBRO" obligations={documents} accounts={accounts} preset={cobroModalItem.obligation} onClose={()=>setCobroModalItem(null)} onDone={operation=>{setCobroModalItem(null);setOperationId(operation.id);reload();}}/>}
      {detail&&<FinancialDetail obligation={detail} onClose={()=>setDetail(null)} onChange={reload}/>}
      {operationId&&<FinancialDetail operationId={operationId} onClose={()=>setOperationId('')} onChange={reload}/>}

    </motion.div>
  );
};
