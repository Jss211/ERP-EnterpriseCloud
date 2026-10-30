import { ProductMasterModal } from '../../components/ProductMasterModal';
import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, Plus, Trash2, CheckCircle, Search, 
  FileText, ArrowDownLeft, Building2, ShoppingBag, ArrowRight
} from 'lucide-react';
import { inventarioService, type Producto } from '../../services/inventarioService';
import { proveedoresService, type Proveedor } from '../../services/proveedoresService';
import { comprasService } from '../../services/comprasService';
import { supabase } from '@/lib/supabase';

interface ItemIngreso {
  id: string;
  productoId: string;
  codigo: string;
  descripcion: string;
  almacen: string;
  cantidad: number;
  costoUnitario: number;
  total: number;
}

export const IngresoKardexPage: React.FC = () => {
  const { darkMode } = useOutletContext<{ darkMode: boolean }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [missingProduct, setMissingProduct] = useState<ItemIngreso | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenesCompra, setOrdenesCompra] = useState<any[]>([]);

  // Formulario cabecera
  const [tipoOperacion, setTipoOperacion] = useState<'COMPRA' | 'INGRESO_AJUSTE' | 'DEVOLUCION'>('COMPRA');
  const [documentoTipo, setDocumentoTipo] = useState('GUÍA DE REMISIÓN');
  const [documentoNumero, setDocumentoNumero] = useState('');
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [almacenDestino, setAlmacenDestino] = useState('Almacén Central');
  const [observaciones, setObservaciones] = useState('');

  // Selector de Orden de Compra para jalar items
  const [selectedOCId, setSelectedOCId] = useState('');

  // Formulario detalle
  const [selectedProdId, setSelectedProdId] = useState('');
  const [inputCantidad, setInputCantidad] = useState('');
  const [inputCosto, setInputCosto] = useState('');
  const [items, setItems] = useState<ItemIngreso[]>([]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    inventarioService.getProductos().then(setProductos);
    proveedoresService.getProveedores().then(setProveedores);

    comprasService.getOrdenesCompra().then(ocs => {
      if (ocs && ocs.length > 0) {
        setOrdenesCompra(ocs);
      } else {
        const cachedOC = localStorage.getItem('erp_ordenes_compra');
        if (cachedOC) {
          try {
            setOrdenesCompra(JSON.parse(cachedOC));
          } catch (e) {
            setOrdenesCompra([]);
          }
        }
      }
    });
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSelectOC = (ocId: string) => {
    setSelectedOCId(ocId);
    if (!ocId) return;

    const oc = ordenesCompra.find(o => o.id === ocId || o.codigo === ocId);
    if (oc) {
      setDocumentoTipo('ORDEN DE COMPRA');
      setDocumentoNumero(oc.codigo || oc.id);
      setTipoOperacion('COMPRA');
      const provNombre = oc.proveedor_nombre || oc.proveedor || '';
      if (provNombre) {
        const provMatch = proveedores.find(p => p.nombre.toLowerCase().includes(provNombre.toLowerCase()));
        if (provMatch) setSelectedProveedorId(provMatch.id);
      }

      if (oc.items && oc.items.length > 0) {
        const mappedItems: ItemIngreso[] = oc.items.map((it: any) => {
          const itCodigo = it.producto_codigo || it.codigo || '';
          const itDesc = it.producto_descripcion || it.descripcion || '';
          const itCant = Number(it.cantidad) || 1;
          const itPrecio = Number(it.costo_unitario || it.precioUnitario) || 0;
          const codeMatches = productos.filter(product => product.codigo === itCodigo);
          const prodMatch = productos.find(product => product.id === it.producto_id) ?? (codeMatches.length === 1 ? codeMatches[0] : undefined);
          return {
            id: Math.random().toString(),
            productoId: prodMatch ? prodMatch.id : '',
            codigo: itCodigo,
            descripcion: itDesc,
            almacen: almacenDestino,
            cantidad: itCant,
            costoUnitario: itPrecio,
            total: itCant * itPrecio
          };
        });
        setItems(mappedItems);
        showToast(`Items importados desde la orden ${oc.codigo || oc.id}`);
      }
    }
  };

  // Detectar parámetro ?oc= en la URL y auto-seleccionar la orden
  useEffect(() => {
    if (ordenesCompra.length > 0) {
      const searchParams = new URLSearchParams(location.search);
      const ocParam = searchParams.get('oc');
      if (ocParam) {
        handleSelectOC(ocParam);
      }
    }
  }, [location.search, ordenesCompra]);

  const handleAddItem = () => {
    if (!selectedProdId || !inputCantidad || !inputCosto) {
      alert('Por favor selecciona un producto e ingresa cantidad y costo unitario.');
      return;
    }

    const prod = productos.find(p => p.id === selectedProdId);
    if (!prod) return;

    const cant = parseFloat(inputCantidad);
    const costo = parseFloat(inputCosto);
    if (isNaN(cant) || isNaN(costo) || cant <= 0 || costo <= 0) {
      alert('Cantidad y costo deben ser valores positivos.');
      return;
    }

    const newItem: ItemIngreso = {
      id: Math.random().toString(),
      productoId: prod.id,
      codigo: prod.codigo,
      descripcion: prod.descripcion,
      almacen: almacenDestino,
      cantidad: cant,
      costoUnitario: costo,
      total: cant * costo
    };

    setItems([...items, newItem]);
    setSelectedProdId('');
    setInputCantidad('');
    setInputCosto('');
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const totalGeneral = items.reduce((acc, i) => acc + i.total, 0);
  const totalCantidad = items.reduce((acc, i) => acc + i.cantidad, 0);

  const handleSubmitIngreso = async () => {
    if (items.length === 0) {
      showToast('Debes ingresar al menos un producto para registrar el ingreso al Kardex.');
      return;
    }

    if (!documentoNumero.trim()) {
      showToast('Por favor especifica el número de documento de ingreso.');
      return;
    }

    setIsSubmitting(true);
    try {
      const currentProds = await inventarioService.getProductos();

      const resolvedItems = items.map(item => {
        const byId = currentProds.find(product => product.id === item.productoId);
        const byCode = currentProds.filter(product => product.codigo === item.codigo);
        return { item, product: byId ?? (byCode.length === 1 ? byCode[0] : undefined) };
      });
      const missing = resolvedItems.find(line => !line.product);
      if (missing) {
        setMissingProduct(missing.item);
        showToast('Revisa y registra el producto en el formulario maestro antes de confirmar el ingreso. No se registraron movimientos.');
        return;
      }
      for (const { item, product } of resolvedItems) {
        const prodId = product!.id;

        await inventarioService.registrarMovimiento({
          productoId: prodId,
          productoCodigo: item.codigo,
          productoDescripcion: item.descripcion,
          tipoMovimiento: 'ENTRADA',
          tipoOperacion: tipoOperacion,
          documentoTipo: documentoTipo,
          documentoNumero: documentoNumero.trim().toUpperCase(),
          detalle: observaciones.trim() || `Ingreso de mercadería - ${documentoTipo} ${documentoNumero}`,
          almacen: item.almacen || almacenDestino,
          cantidad: item.cantidad,
          costoUnitario: item.costoUnitario
        });
      }

      showToast(`¡Ingreso registrado con éxito! Kardex actualizado.`);

      // Si venía de una orden de compra, marcamos como atendida en Supabase y local
      if (selectedOCId) {
        try {
          await supabase
            .from('ordenes_compra')
            .update({ estado: 'RECEPCIONADA' })
            .or(`id.eq.${selectedOCId},codigo.eq.${selectedOCId}`);
        } catch (e) {
          console.warn('Actualización local completada:', e);
        }

        const updatedOCs = ordenesCompra.map(o => (o.id === selectedOCId || o.codigo === selectedOCId) ? { ...o, estado: 'Ingresado al Kardex' } : o);
        localStorage.setItem('erp_ordenes_compra', JSON.stringify(updatedOCs));
        setOrdenesCompra(updatedOCs);
      }

      // Limpiar formulario
      setItems([]);
      setDocumentoNumero('');
      setObservaciones('');
      setSelectedOCId('');
      // Refrescar productos
      const prodsActualizados = await inventarioService.getProductos();
      setProductos(prodsActualizados);
    } catch (err: any) {
      alert(`Error al registrar en Kardex: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: number | undefined | null) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    return `S/ ${num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1400px] mx-auto pb-10 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 mt-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mb-1.5 text-blue-500">
            <span>ERP</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span>INVENTARIOS</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span className="text-gray-400 dark:text-slate-500">INGRESO AL KARDEX</span>
          </div>
          <h1 className={`text-[26px] font-bold tracking-tight leading-none ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>
            Ingreso al Kardex
          </h1>
          <p className={`mt-2 text-[13px] ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Registra entradas de mercadería al almacén físico calculando el costo promedio ponderado SUNAT.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/movimiento-kardex')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors border shadow-sm ${
              darkMode ? 'bg-slate-800 border-slate-700 text-sky-400 hover:bg-slate-700' : 'bg-white border-gray-200 text-sky-600 hover:bg-gray-50'
            }`}
          >
            <ArrowRight size={16} />
            Consultar Kardex
          </button>
          <button 
            onClick={handleSubmitIngreso}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <CheckCircle size={16} strokeWidth={2.5} />
            {isSubmitting ? 'Procesando...' : 'Grabar Ingreso'}
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        
        {/* Left Column: Detalle de Items */}
        <div className="flex-1 w-full space-y-6">
          
          {/* Card 01: Datos de Recepción */}
          <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} rounded-2xl border shadow-sm p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm bg-emerald-500">
                01
              </div>
              <div>
                <h3 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Datos del comprobante / origen</h3>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Define el documento sustentatorio de la entrada</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Tipo de Operación</label>
                <select 
                  value={tipoOperacion}
                  onChange={(e) => setTipoOperacion(e.target.value as any)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm font-medium ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                >
                  <option value="COMPRA">Compra Nacional</option>
                  <option value="INGRESO_AJUSTE">Ajuste / Inventario Inicial</option>
                  <option value="DEVOLUCION">Devolución de Cliente</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Tipo Documento</label>
                <select 
                  value={documentoTipo}
                  onChange={(e) => setDocumentoTipo(e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm font-medium ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                >
                  <option value="GUÍA DE REMISIÓN">Guía de Remisión</option>
                  <option value="FACTURA DE COMPRA">Factura de Compra</option>
                  <option value="ORDEN DE COMPRA">Orden de Compra</option>
                  <option value="NOTA DE ENTRADA">Nota de Entrada</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>N° Documento *</label>
                <input 
                  type="text" 
                  placeholder="Ej: GR-001-2026 / F001-992" 
                  value={documentoNumero}
                  onChange={(e) => setDocumentoNumero(e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm uppercase font-mono ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                />
              </div>
            </div>

            {/* Opción rápida: Jalar desde Orden de Compra */}
            {ordenesCompra.length > 0 && (
              <div className={`mt-4 p-4 rounded-xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-blue-50/50 border-blue-100'} flex flex-col md:flex-row items-start md:items-center justify-between gap-3`}>
                <div className="flex items-center gap-2">
                  <ShoppingBag size={18} className="text-blue-500" />
                  <span className={`text-xs font-bold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                    ¿Deseas recepcionar una Orden de Compra existente?
                  </span>
                </div>
                <select 
                  value={selectedOCId}
                  onChange={(e) => handleSelectOC(e.target.value)}
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-blue-200 text-blue-900'}`}
                >
                  <option value="">Seleccionar Orden de Compra...</option>
                  {ordenesCompra.map(oc => {
                    const ocCode = oc.codigo || oc.id;
                    const ocProv = oc.proveedor_nombre || oc.proveedor || 'Proveedor General';
                    const ocEstado = oc.estado || 'Emitida';
                    return (
                      <option key={ocCode} value={ocCode}>
                        {ocCode} - {ocProv} ({ocEstado})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Card 02: Detalle de Productos a Ingresar */}
          <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} rounded-2xl border shadow-sm p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm bg-emerald-500">
                02
              </div>
              <div>
                <h3 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Productos a ingresar</h3>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Agrega los items y sus costos de adquisición</p>
              </div>
            </div>

            {/* Agregar item */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6 items-end">
              <div className="md:col-span-5">
                <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Producto</label>
                <select 
                  value={selectedProdId}
                  onChange={(e) => {
                    setSelectedProdId(e.target.value);
                    const prod = productos.find(p => p.id === e.target.value);
                    if (prod) setInputCosto(prod.costoUnitario.toString());
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                >
                  <option value="">Seleccionar del catálogo...</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} - {p.descripcion} (Stock actual: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Cantidad</label>
                <input 
                  type="number" 
                  placeholder="0" 
                  value={inputCantidad}
                  onChange={(e) => setInputCantidad(e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                />
              </div>

              <div className="md:col-span-3">
                <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Costo Unit. (S/)</label>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00" 
                  value={inputCosto}
                  onChange={(e) => setInputCosto(e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                />
              </div>

              <div className="md:col-span-2">
                <button 
                  type="button"
                  onClick={handleAddItem}
                  className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1 transition-colors shadow-sm"
                >
                  <Plus size={16} /> Agregar
                </button>
              </div>
            </div>

            {/* Tabla de Items */}
            <div className={`border rounded-xl overflow-hidden ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
              <table className="w-full text-left text-sm">
                <thead className={`${darkMode ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-50 text-slate-500'} text-xs uppercase font-bold`}>
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3 text-right">Cant.</th>
                    <th className="px-4 py-3 text-right">Costo Unit.</th>
                    <th className="px-4 py-3 text-right">Importe</th>
                    <th className="px-3 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-gray-100'}`}>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                        No hay productos agregados en este ingreso.
                      </td>
                    </tr>
                  ) : (
                    items.map(it => (
                      <tr key={it.id} className={`${darkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-blue-500">{it.codigo}</td>
                        <td className={`px-4 py-3 font-medium text-xs ${darkMode ? 'text-white' : 'text-slate-800'}`}>{it.descripcion}</td>
                        <td className="px-4 py-3 text-right font-bold text-xs">{it.cantidad}</td>
                        <td className="px-4 py-3 text-right text-xs">{formatCurrency(it.costoUnitario)}</td>
                        <td className="px-4 py-3 text-right font-bold text-xs">{formatCurrency(it.total)}</td>
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => handleRemoveItem(it.id)} className="text-rose-500 hover:text-rose-700">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>

        {/* Right Column: Resumen y Almacén */}
        <div className="w-full xl:w-[380px] shrink-0 space-y-6">
          
          {/* Destino y Proveedor */}
          <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} rounded-2xl border shadow-sm p-6`}>
            <h3 className={`text-base font-bold mb-4 ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Destino & Proveedor</h3>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Almacén Destino</label>
                <input 
                  type="text" 
                  value={almacenDestino}
                  onChange={(e) => setAlmacenDestino(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Proveedor (Opcional)</label>
                <select 
                  value={selectedProveedorId}
                  onChange={(e) => setSelectedProveedorId(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                >
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.documento})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Observaciones</label>
                <textarea 
                  rows={2}
                  placeholder="Detalle adicional de la recepción..." 
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                />
              </div>
            </div>
          </div>

          {/* Resumen Valorizado */}
          <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} rounded-2xl border shadow-sm p-6`}>
            <h3 className={`text-base font-bold mb-1 ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Resumen del Ingreso</h3>
            <p className={`text-xs mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Totalización física y monetaria</p>

            <div className={`space-y-3 pb-5 border-b text-sm ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
              <div className="flex justify-between">
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Items a ingresar</span>
                <span className="font-bold">{items.length}</span>
              </div>
              <div className="flex justify-between">
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Total Unidades</span>
                <span className="font-bold">{totalCantidad} UND</span>
              </div>
            </div>

            <div className="pt-4 mb-6 flex justify-between items-end">
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>VALORIZACIÓN TOTAL</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">PEN</span>
              </div>
              <span className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {formatCurrency(totalGeneral)}
              </span>
            </div>

            <button 
              onClick={handleSubmitIngreso}
              disabled={isSubmitting || items.length === 0}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Registrando en Kardex...' : 'Confirmar Ingreso a Almacén'}
            </button>
            <p className={`text-[11px] text-center mt-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Esta acción aumentará el stock y generará la entrada en el Kardex permanente.
            </p>
          </div>

        </div>

      </div>

      {missingProduct && <ProductMasterModal editingProduct={null} initialDraft={{ codigo: missingProduct.codigo, descripcion: missingProduct.descripcion, almacen: missingProduct.almacen, costoUnitario: missingProduct.costoUnitario }} darkMode={darkMode} onClose={() => setMissingProduct(null)} onSaved={async () => { setProductos(await inventarioService.getProductos()); }} />}

      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 z-50">
            <CheckCircle size={18} />
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
