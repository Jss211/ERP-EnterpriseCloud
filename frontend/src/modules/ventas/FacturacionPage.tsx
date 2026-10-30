import React, { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, CheckCircle, Search, CreditCard, Clock, Building, ArrowRight, AlertCircle, ShoppingBag
} from 'lucide-react';
import { ventasService } from '../../services/ventasService';
import { supabase } from '@/lib/supabase';

export const FacturacionPage: React.FC = () => {
  const { darkMode } = useOutletContext<{ darkMode: boolean }>();
  
  // Órdenes pendientes generadas desde Orden de Venta
  const [duplicateNotice, setDuplicateNotice] = useState('');
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);

  useEffect(() => {
    const loadPendingOrders = async () => {
      try {
        const dbVentas = await ventasService.getVentas();
        const cachedOrders = localStorage.getItem('erp_ordenes_venta');
        const localOrders = cachedOrders ? JSON.parse(cachedOrders) : [];
        const billedOrders = new Set<string>(JSON.parse(localStorage.getItem('erp_ordenes_facturadas') || '[]'));

        // Filtrar dbVentas que NO estén ya facturadas o completadas
        const pendingDbVentas = dbVentas.filter(v => {
          if (v.numero && (v.numero.startsWith('F001') || v.numero.startsWith('B001'))) return false;
          if (v.estado !== 'Pendiente') return false;
          if (billedOrders.has(v.id) || (v.numero && billedOrders.has(v.numero))) return false;
          return true;
        });

        // Identificar IDs de órdenes ya presentes en Supabase (en numero o en notas)
        const knownOrderRefs = new Set<string>();
        dbVentas.forEach(v => {
          if (v.numero) knownOrderRefs.add(v.numero);
          if (v.notas) {
            const match = v.notas.match(/OV-\d+-\d+/);
            if (match) knownOrderRefs.add(match[0]);
          }
        });

        // Convertir ventas pendientes de Supabase a formato de órdenes pendientes
        const formattedDb = pendingDbVentas.map(v => {
          const ovMatch = v.notas?.match(/OV-\d+-\d+/);
          const displayId = ovMatch ? ovMatch[0] : (v.numero || v.id);
          return {
            id: displayId,
            dbId: v.id,
            cliente: v.cliente_nombre,
            ruc: '',
            fecha: new Date(v.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }),
            total: v.total,
            items: (v.items || []).map((i: any) => ({
              desc: i.descripcion,
              cant: i.cantidad,
              pUnitario: i.precio_unitario,
              total: i.subtotal
            })),
            estado: 'Pendiente'
          };
        }).filter(o => !billedOrders.has(o.id));

        // Filtrar órdenes locales para descartar aquellas que ya están en Supabase o ya facturadas
        const unrepresentedLocal = localOrders.filter((lo: any) => !knownOrderRefs.has(lo.id) && !billedOrders.has(lo.id));

        // Preserve all distinct document IDs. Historical browser data remains untouched.
        const candidates = [...formattedDb, ...unrepresentedLocal];
        const signatures = new Map<string, number>();
        candidates.forEach(order => {
          const signature = `${String(order.cliente).trim().toLocaleLowerCase()}-${Number(order.total).toFixed(2)}`;
          signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
        });
        const possibleDuplicates = [...signatures.values()].filter(count => count > 1).length;
        setDuplicateNotice(possibleDuplicates ? `${possibleDuplicates} coincidencia(s) de cliente e importe. Revisa los documentos antes de facturar; no se eliminaron ni fusionaron datos.` : '');
        const uniqueOrders = candidates;

        setPendingOrders(uniqueOrders);
      } catch (e) {
        console.error('Error cargando ventas para facturación:', e);
      }
    };
    loadPendingOrders();
  }, []);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isEmitting, setIsEmitting] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleEmitirFactura = () => {
    if (!selectedOrder) return;
    
    setIsEmitting(true);
    
    setTimeout(() => {
      setIsEmitting(false);
      const invoiceNumber = `F001-${Math.floor(Math.random() * 9000) + 1000}`;
      showToast(`¡Comprobante ${invoiceNumber} registrado con éxito en contabilidad!`);
      
      // 1. Quitar de Órdenes Pendientes inmediatamente
      setPendingOrders(prev => prev.filter(o => o.id !== selectedOrder.id && (!selectedOrder.dbId || o.dbId !== selectedOrder.dbId)));

      // 2. Registrar en lista negra de facturadas para que no vuelva a aparecer jamás
      const currentBilled: string[] = JSON.parse(localStorage.getItem('erp_ordenes_facturadas') || '[]');
      if (selectedOrder.id) currentBilled.push(selectedOrder.id);
      if (selectedOrder.dbId) currentBilled.push(selectedOrder.dbId);
      localStorage.setItem('erp_ordenes_facturadas', JSON.stringify([...new Set(currentBilled)]));

      const cachedOrders = localStorage.getItem('erp_ordenes_venta');
      if (cachedOrders) {
        const localOrders = JSON.parse(cachedOrders);
        const updatedLocal = localOrders.filter((o: any) => o.id !== selectedOrder.id && (!selectedOrder.dbId || o.dbId !== selectedOrder.dbId));
        localStorage.setItem('erp_ordenes_venta', JSON.stringify(updatedLocal));
      }

      // 3. Enviar a Estado de Cuenta
      const cachedCuenta = localStorage.getItem('erp_estado_cuenta');
      const cuentaDB = cachedCuenta ? JSON.parse(cachedCuenta) : [];
      
      const combinedProductsStr = selectedOrder.items.map((i: any) => `${i.cant}x ${i.desc}`).join(', ');

      const newInvoice = {
        dbId: selectedOrder.dbId,
        tipo: selectedOrder.cliente.includes('S.A.') || selectedOrder.cliente.includes('E.I.R.L.') || selectedOrder.ruc?.startsWith('20') ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA',
        fecha: new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
        rawFecha: new Date().toISOString(),
        nro: invoiceNumber,
        razonSocial: selectedOrder.cliente,
        productos: combinedProductsStr,
        metodoPago: 'Efectivo',
        estado: 'PENDIENTE',
        total: selectedOrder.total,
        saldo: selectedOrder.total,
        pagado: 0
      };

      localStorage.setItem('erp_estado_cuenta', JSON.stringify([newInvoice, ...cuentaDB]));

      // 4. Si la orden provenía de Supabase, actualizar con el número de comprobante y estado Completada
      if (selectedOrder.dbId) {
        supabase.from('ventas').update({
          numero: invoiceNumber,
          estado: 'Completada',
          notas: `Comprobante emitido para orden ${selectedOrder.id}`
        }).eq('id', selectedOrder.dbId).then();
      }
      
      setSelectedOrder(null);
    }, 1500);
  };

  const formatCurrency = (val: number) => `S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filteredOrders = pendingOrders.filter(o => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (o.id && o.id.toLowerCase().includes(q)) || 
      (o.cliente && o.cliente.toLowerCase().includes(q)) ||
      (o.ruc && o.ruc.includes(q))
    );
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1400px] mx-auto pb-10 font-sans print:p-0 print:pb-0"
    >
      {/* Header idéntico a Orden de Compra/Venta */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 mt-2 print:hidden">
      {duplicateNotice && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{duplicateNotice}</p>}
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mb-1.5 text-blue-500">
            <span>ERP</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span>VENTAS</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span className="text-gray-400 dark:text-slate-500">FACTURACIÓN</span>
          </div>
          <h1 className={`text-[26px] font-bold tracking-tight leading-none ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>
            Facturación
          </h1>
          <p className={`mt-2 text-[13px] ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Convierte tus órdenes de venta en comprobantes contables válidos.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSelectedOrder(null)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors border shadow-sm ${
              darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Cancelar
          </button>
          <button 
            onClick={() => {
              if(!selectedOrder) {
                showToast("Primero selecciona una orden para poder imprimir la factura.");
                return;
              }
              window.print();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors border shadow-sm ${
              darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Imprimir
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start print:block print:w-full print:m-0">
        
        {/* PANEL IZQUIERDO: Bandeja de Entrada de Órdenes */}
        <div className={`w-full lg:w-[400px] flex flex-col rounded-2xl border shadow-sm overflow-hidden sticky top-6 max-h-[80vh] print:hidden ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
        }`}>
          <div className={`p-5 border-b ${darkMode ? 'border-slate-800 bg-slate-800/50' : 'border-gray-100 bg-gray-50'}`}>
            <h2 className={`font-bold flex items-center gap-2 mb-4 ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>
              <Clock size={18} className="text-[#0ea5e9]" />
              Órdenes Pendientes
              <span className="ml-auto bg-[#0ea5e9] text-white text-[10px] px-2 py-0.5 rounded-full">
                {pendingOrders.length}
              </span>
            </h2>
            
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} size={16} />
              <input 
                type="text" 
                placeholder="Buscar por cliente u OV..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/50 transition-all ${
                  darkMode ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-gray-200 text-[#2d3436] placeholder-gray-400'
                }`}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            <AnimatePresence>
              {filteredOrders.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${
                    darkMode ? 'bg-slate-800 text-slate-400' : 'bg-blue-50 text-[#0ea5e9]'
                  }`}>
                    {searchQuery ? <Search size={20} /> : <ShoppingBag size={20} />}
                  </div>
                  <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    {searchQuery ? `No hay órdenes para "${searchQuery}"` : 'No hay órdenes pendientes'}
                  </p>
                  <p className={`text-xs mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    {searchQuery 
                      ? 'Verifica que la orden pertenezca a un Cliente registrado en el área de Ventas.' 
                      : 'Crea una orden en Ventas → Orden de venta para poder emitir su factura aquí.'}
                  </p>
                  {!searchQuery && (
                    <Link
                      to="/orden-venta"
                      className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-1.5 rounded-lg bg-[#0ea5e9] hover:bg-[#0284c7] text-white text-xs font-bold transition-colors shadow-sm"
                    >
                      Ir a Orden de venta
                    </Link>
                  )}
                </div>
              ) : (
                filteredOrders.map(order => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, height: 0 }}
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`p-4 rounded-xl cursor-pointer border transition-all ${
                      selectedOrder?.id === order.id
                        ? darkMode ? 'bg-[#0ea5e9]/20 border-[#0ea5e9]/50 shadow-md' : 'bg-[#f0f9ff] border-[#bae6fd] shadow-md'
                        : darkMode ? 'bg-slate-800/30 border-slate-800 hover:border-slate-700' : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        darkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {order.id}
                      </span>
                      <span className={`text-xs font-semibold ${darkMode ? 'text-[#38bdf8]' : 'text-[#0284c7]'}`}>
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                    <p className={`text-sm font-bold truncate mb-1 ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>
                      {order.cliente}
                    </p>
                    <p className={`text-[11px] flex items-center gap-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                      <Building size={12} /> {order.ruc}
                    </p>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* PANEL DERECHO: Pre-visualización de Factura */}
        <div className="flex-1 flex flex-col min-w-0 print:block print:w-full">
          {selectedOrder ? (
            <>
              {/* VISTA EN PANTALLA (Moderna con Tablas) - Se oculta al imprimir */}
              <motion.div 
                key={selectedOrder.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex flex-col rounded-2xl border shadow-sm overflow-hidden relative print:hidden ${
                  darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
                }`}
              >
                <div className={`p-8 border-b ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className={`text-2xl font-black uppercase tracking-widest mb-1 ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>FACTURA</h2>
                      <p className={`text-sm font-medium ${darkMode ? 'text-[#38bdf8]' : 'text-[#0284c7]'}`}>Documento Oficial</p>
                    </div>
                    <div className={`text-right ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-1">Referencia</p>
                      <p className="text-sm font-mono font-bold">{selectedOrder.id}</p>
                      <p className="text-xs mt-1">Estado: Pendiente</p>
                    </div>
                  </div>

                  <div className={`mt-8 p-5 rounded-xl border ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Datos del Receptor</p>
                    <p className={`text-base font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>{selectedOrder.cliente}</p>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>RUC: {selectedOrder.ruc}</p>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Fecha Emisión: {selectedOrder.fecha}</p>
                  </div>
                </div>

                <div className="p-8">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className={`border-b ${darkMode ? 'border-slate-800 text-slate-400' : 'border-gray-200 text-gray-500'}`}>
                        <th className="pb-3 font-bold text-xs uppercase">Descripción</th>
                        <th className="pb-3 font-bold text-xs uppercase text-center w-20">Cant</th>
                        <th className="pb-3 font-bold text-xs uppercase text-right w-28">P. Unit</th>
                        <th className="pb-3 font-bold text-xs uppercase text-right w-32">Total</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-slate-800/50' : 'divide-gray-100'}`}>
                      {selectedOrder.items.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className={`py-4 ${darkMode ? 'text-slate-300' : 'text-[#2d3436]'}`}>{item.desc}</td>
                          <td className={`py-4 text-center ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>{item.cant}</td>
                          <td className={`py-4 text-right ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>{formatCurrency(item.pUnitario)}</td>
                          <td className={`py-4 text-right font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={`p-8 border-t ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div className="w-full md:w-1/2">
                      <button 
                        onClick={handleEmitirFactura}
                        disabled={isEmitting}
                        className={`w-full py-4 rounded-xl text-white font-bold text-base transition-all shadow-md flex items-center justify-center gap-3 ${
                          isEmitting ? 'bg-[#7dd3fc] cursor-not-allowed' : 'bg-[#0ea5e9] hover:bg-[#0284c7] hover:-translate-y-0.5'
                        }`}
                      >
                        {isEmitting ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Registrando...
                          </span>
                        ) : (
                          <>
                            <CreditCard size={20} />
                            Registrar Comprobante
                          </>
                        )}
                      </button>
                      <p className={`text-xs text-center mt-3 ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                        Al grabar podrás visualizar el registro contable.
                      </p>
                    </div>

                    <div className="w-full md:w-64 space-y-2">
                      <div className={`flex justify-between text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                        <span>Op. Gravadas</span>
                        <span>{formatCurrency(selectedOrder.total / 1.18)}</span>
                      </div>
                      <div className={`flex justify-between text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                        <span>IGV (18%)</span>
                        <span>{formatCurrency(selectedOrder.total - (selectedOrder.total / 1.18))}</span>
                      </div>
                      <div className={`flex justify-between text-xl font-black pt-3 border-t ${darkMode ? 'border-slate-700 text-white' : 'border-gray-200 text-[#2d3436]'}`}>
                        <span>TOTAL</span>
                        <span className="text-[#0ea5e9]">{formatCurrency(selectedOrder.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* VISTA PARA IMPRESIÓN (Ticket POS) - Oculto en pantalla, visible al imprimir */}
              <div className="hidden print:flex print:flex-col print:items-center print:justify-start print:w-full print:pt-16">
                <div id="print-ticket" className="w-[500px] bg-white text-black p-10 font-mono text-[14px] leading-relaxed mx-auto border-2 border-black rounded-md">
                  
                  <div className="text-center mb-4">
                    <p className="font-bold text-lg">FACTURA ELECTRÓNICA</p>
                    <p className="font-bold text-lg mt-1">F002-{selectedOrder.id.replace('OV-', '')}</p>
                  </div>
                  
                  <div className="border-b-2 border-black my-3"></div>
                  
                  <div className="mb-3">
                    <p>Señores : {selectedOrder.cliente.toUpperCase()}</p>
                    <p>RUC. : {selectedOrder.ruc}</p>
                  </div>
                  
                  <div className="border-b-2 border-black my-3"></div>
                  
                  <div className="mb-3">
                    <p>Fecha : {selectedOrder.fecha} 11:14:48</p>
                  </div>
                  
                  <div className="border-b-2 border-black my-3"></div>
                  
                  <table className="w-full text-left mb-3">
                    <thead>
                      <tr>
                        <th className="font-bold pb-2">Producto</th>
                        <th className="font-bold pb-2 text-right">Cant.</th>
                        <th className="font-bold pb-2 text-right">Precio</th>
                        <th className="font-bold pb-2 text-right">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((item: any, idx: number) => (
                        <tr key={idx} className="align-top">
                          <td className="pr-2 py-2">{item.desc.toUpperCase()}</td>
                          <td className="text-right py-2">{item.cant.toFixed(1)}</td>
                          <td className="text-right py-2">{item.pUnitario.toFixed(2)}</td>
                          <td className="text-right py-2">{item.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  <div className="border-b-2 border-black my-3"></div>
                  
                  <div className="flex justify-between mb-1">
                    <span>OP. GRAVADAS</span>
                    <span>S/ {(selectedOrder.total / 1.18).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>I.G.V (18%)</span>
                    <span>S/ {(selectedOrder.total - (selectedOrder.total / 1.18)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-xl mt-4 mb-4">
                    <span>TOTAL VENTA</span>
                    <span>S/ {selectedOrder.total.toFixed(2)}</span>
                  </div>
                  
                  <div className="text-center mb-4">
                    <p>SON: CON 00/100 PEN</p>
                  </div>
                  
                  <div className="border-b-2 border-black my-3"></div>
                  
                  <div className="mb-3 font-bold text-base">
                    <p>CONDICIÓN: CONTADO / EFECTIVO</p>
                  </div>
                  
                  <div className="border-b-2 border-black my-3"></div>
                  
                  <div className="text-center mt-4 mb-3">
                    <p>Representacion impresa de la factura electronica</p>
                    <p>Gracias por su preferencia</p>
                  </div>
                  
                </div>
              </div>
            </>
          ) : (
            <div className={`flex-1 flex flex-col items-center justify-center rounded-2xl border border-dashed ${
              darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-gray-50 border-gray-300'
            }`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
                darkMode ? 'bg-slate-800 text-slate-600' : 'bg-white shadow-sm text-gray-300'
              }`}>
                <ArrowRight size={32} />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-700'}`}>Ninguna orden seleccionada</h3>
              <p className={`text-sm max-w-sm text-center ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Selecciona una orden de la bandeja izquierda para cargar los datos automáticamente.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-6 bg-emerald-500 text-white px-5 py-4 rounded-xl shadow-lg flex items-center gap-3 z-50 min-w-[300px] print:hidden"
          >
            <div className="bg-white/20 p-1 rounded-full shrink-0">
              <CheckCircle size={18} />
            </div>
            <p className="font-medium text-sm leading-snug">{toastMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
