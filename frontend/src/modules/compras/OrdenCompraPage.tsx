import { pendingInvoiceService } from './facturas/pendingRuntime';
import { invoiceInternalId } from './facturas/types';
import { ProductSearchResults } from '../../components/masters/ProductSearchResults';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Search, Package, Receipt, Building2, Trash2, CheckCircle, ArrowRight, Eye, UserPlus, History, X
} from 'lucide-react';
import { inventarioService, type Producto } from '../../services/inventarioService';
import { proveedoresService, type Proveedor } from '../../services/proveedoresService';
import { comprasService, type OrdenCompra } from '../../services/comprasService';
import { QuickPartyCreateModal } from '../../components/QuickPartyCreateModal';
import { OrderDetailsModal, type OrderDetails } from '../../components/OrderDetailsModal';
import { recordDashboardMovement } from '../../lib/dashboardMovements';

interface ProductLine {
  id: string;
  productoId: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

export const OrdenCompraPage: React.FC = () => {
  const { darkMode } = useOutletContext<{ darkMode: boolean }>();
  const savingOrderRef = useRef(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const orderAttempt = useRef('');
  const [invoiceGeneration, setInvoiceGeneration] = useState<{ order: OrdenCompra; error: string; internalId?: string } | null>(null);
  const [generatingPending, setGeneratingPending] = useState(false);
  async function generatePending(order: OrdenCompra) {
    setGeneratingPending(true);
    try { const row = await pendingInvoiceService.ensureFromOrder(order); setInvoiceGeneration({ order, error: '', internalId: invoiceInternalId(row) }); }
    catch(e) { setInvoiceGeneration({ order, error: e instanceof Error ? e.message : 'No se pudo generar el pendiente.' }); }
    finally { setGeneratingPending(false); }
  }
  const [products, setProducts] = useState<ProductLine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputCant, setInputCant] = useState('');
  const [inputPrecio, setInputPrecio] = useState('');
  const [descuentoGlobal, setDescuentoGlobal] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [savedOrderAlert, setSavedOrderAlert] = useState<{
    ocId: string;
    total: number;
    proveedor: string;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickSupplierOpen, setIsQuickSupplierOpen] = useState(false);
  const [isSupplierHistoryOpen, setIsSupplierHistoryOpen] = useState(false);
  const [supplierHistorySearch, setSupplierHistorySearch] = useState('');
  const [selectedProveedor, setSelectedProveedor] = useState<any>(null);
  const [proveedorSearch, setProveedorSearch] = useState('');
  const [proveedoresDB, setProveedoresDB] = useState<any[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrdenCompra[]>([]);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<OrderDetails | null>(null);
  const [productDB, setProductDB] = useState<Producto[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null);

  const mapProveedorForOrder = (proveedor: Proveedor) => ({
    id: proveedor.id,
    nombre: proveedor.nombre,
    tipo_persona: proveedor.tipo_persona || (proveedor.documento?.length === 11 ? 'JURIDICA' : 'NATURAL'),
    tipo_documento: proveedor.documento?.length === 8 ? 'DNI' : 'RUC',
    documento: proveedor.documento,
    ruc: proveedor.documento,
    email: proveedor.email || 'No registrado',
    telefono: proveedor.telefono || 'No registrado',
    direccion: proveedor.direccion || 'No registrada',
    condicion_pago: proveedor.condicion_pago ?? 30,
    condicion: proveedor.condicion_pago === 0 ? 'Contado' : `${proveedor.condicion_pago} días`,
    estado: proveedor.estado || 'Activo'
  });

  const refreshOrderHistory = async () => {
    const ordersFromService = await comprasService.getOrdenesCompra();
    const cachedOrders = JSON.parse(localStorage.getItem('erp_ordenes_compra') || '[]');
    const dbOrders = ordersFromService.map((order: any) => ({
      ...order,
      descuento_global: order.descuento_global ?? cachedOrders.find((cached: any) => cached.uuid === order.id || cached.id === order.id)?.descuento_global,
      id: order.id || order.uuid || order.codigo,
      codigo: order.codigo || order.numero || order.id,
      proveedor_nombre: order.proveedor_nombre || order.proveedor || 'Proveedor',
      proveedor_documento: order.proveedor_documento || order.proveedor_ruc || order.ruc || '',
      subtotal: Number(order.subtotal) || 0,
      igv: Number(order.igv) || 0,
      total: Number(order.total) || 0,
      estado: order.estado || 'EMITIDA',
      fecha_emision: order.fecha_emision || order.fecha || new Date().toISOString(),
      items: (order.items || []).map((item: any) => ({
        ...item,
        producto_codigo: item.producto_codigo || item.codigo || '',
        producto_descripcion: item.producto_descripcion || item.descripcion || 'Producto',
        unidad: item.unidad || 'UND',
        cantidad: Number(item.cantidad) || 0,
        costo_unitario: Number(item.costo_unitario ?? item.precioUnitario) || 0,
        subtotal: Number(item.subtotal ?? item.importe) || 0
      }))
    }));
    const knownCodes = new Set(dbOrders.map(order => order.codigo));
    const localOrders = cachedOrders
      .filter((order: any) => !knownCodes.has(order.codigo || order.id))
      .map((order: any) => ({
        ...order,
        id: order.uuid || order.id,
        codigo: order.codigo || order.id,
        proveedor_id: order.proveedor_id,
        proveedor_nombre: order.proveedor_nombre || order.proveedor || 'Proveedor',
        proveedor_documento: order.proveedor_documento || order.ruc || '',
        subtotal: Number(order.subtotal) || 0,
        igv: Number(order.igv) || 0,
        total: Number(order.total) || 0,
        moneda: 'PEN',
        estado: 'EMITIDA' as const,
        fecha_emision: order.fecha || new Date().toISOString(),
        items: (order.items || []).map((item: any) => ({
          ...item,
          producto_codigo: item.producto_codigo || item.codigo || '',
          producto_descripcion: item.producto_descripcion || item.descripcion || 'Producto',
          unidad: item.unidad || 'UND',
          cantidad: Number(item.cantidad) || 0,
          costo_unitario: Number(item.costo_unitario ?? item.precioUnitario) || 0,
          subtotal: Number(item.subtotal ?? item.importe) || 0
        }))
      }));
    setOrderHistory([...dbOrders, ...localOrders]);
  };

  const getOrderSupplier = (order: OrdenCompra) => proveedoresDB.find(proveedor =>
    (order.proveedor_id && proveedor.id === order.proveedor_id)
    || proveedor.nombre.toLocaleLowerCase('es-PE') === String(order.proveedor_nombre || '').toLocaleLowerCase('es-PE')
  );

  const filteredSupplierOrders = useMemo(() => {
    const query = supplierHistorySearch.trim().toLocaleLowerCase('es-PE');
    if (!query) return [];

    return orderHistory.filter(order => {
      const supplier = getOrderSupplier(order);
      const supplierName = String(order.proveedor_nombre || '').toLocaleLowerCase('es-PE');
      const supplierDocument = String(
        order.proveedor_documento
        || supplier?.documento
        || supplier?.ruc
        || ''
      ).toLocaleLowerCase('es-PE');

      return supplierName.includes(query) || supplierDocument.includes(query);
    });
  }, [orderHistory, proveedoresDB, supplierHistorySearch]);

  useEffect(() => {
    inventarioService.getProductos().then(prods => {
      setProductDB(prods);
    });
    proveedoresService.getProveedores().then(provs => {
      setProveedoresDB(provs.map(mapProveedorForOrder));
    });
    void refreshOrderHistory();
  }, []);

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return productDB.slice(0, 8);
    return productDB.filter(p => 
      p.descripcion.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.codigo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.categoria && p.categoria.toLowerCase().includes(searchQuery.toLowerCase()))
    ).slice(0, 8);
  }, [productDB, searchQuery]);

  const handleAddProduct = () => {
    if (!searchQuery || !inputCant || !inputPrecio) return;
    
    const dbProduct = selectedProduct && productDB.find(product => product.id === selectedProduct.id);
    if (!dbProduct) { showToast('Selecciona un producto existente de la lista de Maestros.'); return; }
    
    const cant = parseFloat(inputCant);
    const precio = parseFloat(inputPrecio);
    
    if (isNaN(cant) || isNaN(precio) || cant <= 0 || precio <= 0) return;

    const newProduct: ProductLine = {
      id: Math.random().toString(),
      productoId: dbProduct.id,
      codigo: dbProduct.codigo,
      descripcion: dbProduct.descripcion,
      unidad: dbProduct.unidad,
      cantidad: cant,
      precioUnitario: precio,
      importe: cant * precio
    };

    setProducts([...products, newProduct]);
    setSearchQuery('');
    setInputCant('');
    setInputPrecio('');
    setSelectedProduct(null);
    setShowProductDropdown(false);
  };

  const removeProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const subtotal = products.reduce((acc, curr) => acc + curr.importe, 0);
  const descValue = parseFloat(descuentoGlobal) || 0;
  const subtotalConDescuento = subtotal - descValue;
  const igv = subtotalConDescuento * 0.18;
  const total = subtotalConDescuento + igv;

  const formatCurrency = (val: number) => `S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSaveOrder = async () => {
    if (savingOrderRef.current) return;
    if (!selectedProveedor) {
      showToast('Selecciona un proveedor antes de grabar la orden de compra.');
      return;
    }

    if (products.length === 0) {
      showToast("No puedes grabar una orden vacía. Agrega al menos un producto.");
      return;
    }

    savingOrderRef.current = true; setSavingOrder(true);
    if (!orderAttempt.current) orderAttempt.current = `OC-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`;
    const ocId = orderAttempt.current;
    const provNombre = selectedProveedor.nombre;
    const provRuc = selectedProveedor.ruc;

    let savedOrder: OrdenCompra;
    try {
      savedOrder = await comprasService.createOrdenCompra({
        descuento_global: descValue,
        codigo: ocId,
        proveedor_id: selectedProveedor?.id,
        proveedor_nombre: provNombre,
        proveedor_documento: provRuc,
        subtotal,
        igv,
        total,
        items: products.map(p => ({
          producto_id: p.productoId,
          producto_codigo: p.codigo,
          producto_descripcion: p.descripcion,
          unidad: p.unidad,
          cantidad: p.cantidad,
          costo_unitario: p.precioUnitario,
          subtotal: p.importe
        }))
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar la orden. El formulario se conserva.');
      savingOrderRef.current = false; setSavingOrder(false); return;
    }
    await generatePending(savedOrder);
    try { await refreshOrderHistory(); } catch { showToast('La orden est\u00e1 guardada. No se pudo actualizar el historial.'); }

    const now = new Date();
    try { recordDashboardMovement({
      id: `compra-${ocId}`,
      timestamp: now.toISOString(),
      fecha: now.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }),
      descripcion: `Compra a ${provNombre.substring(0, 20)} - Orden #${ocId}`,
      tipo: 'salida',
      monto: total
    }); } catch { /* The saved order and its pending invoice are independent of dashboard storage. */ }

    showToast(`¡Orden de Compra ${ocId} grabada con éxito! Se envió al módulo de ALMACÉN para la recepción de mercadería.`);

    // Limpiar el formulario
    setProducts([]);
    setDescuentoGlobal('');
    setSearchQuery('');
    setInputCant('');
    setInputPrecio('');
    setSelectedProveedor(null);
    orderAttempt.current = ''; savingOrderRef.current = false; setSavingOrder(false);
  };

  const handleNuevaCompra = () => {
    if (products.length > 0 || searchQuery || inputCant || inputPrecio || descuentoGlobal || selectedProveedor) {
      if (window.confirm('¿Estás seguro de limpiar la pantalla para crear una nueva orden?')) {
        setProducts([]);
        setSearchQuery('');
        setInputCant('');
        setInputPrecio('');
        setDescuentoGlobal('');
        setSelectedProveedor(null);
      }
    }
  };

  // Colores principales
  const tealColor = '#00b894';
  const tealBadge = '#78e08f';
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1400px] mx-auto pb-10 font-sans"
    >
      {/* Header (Título y botones superiores) */}
      {invoiceGeneration && <div role={invoiceGeneration.error ? 'alert' : 'status'} className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"><p>Orden {invoiceGeneration.order.codigo} guardada. {invoiceGeneration.error ? 'No se pudo generar la referencia pendiente de factura.' : `Referencia interna: ${invoiceGeneration.internalId}`}</p>{invoiceGeneration.error && <><p>{invoiceGeneration.error}</p><button type="button" disabled={generatingPending} onClick={() => void generatePending(invoiceGeneration.order)} className="mt-2 rounded-lg border px-3 py-2">Generar pendiente sin volver a guardar la orden</button></>}<Link to="/facturas-proveedores" className="ml-3 inline-block py-2 font-semibold underline">Ver facturas de proveedores</Link>{invoiceGeneration.order.localBackupWarning && <p>{invoiceGeneration.order.localBackupWarning}</p>}</div>}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 mt-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mb-1.5 text-blue-500">
            <span>ERP</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span>COMPRAS</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span className="text-gray-400 dark:text-slate-500">CONSULTA</span>
          </div>
          <h1 className={`text-[26px] font-bold tracking-tight leading-none ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>
            Orden de compra
          </h1>
          <p className={`mt-2 text-[13px] ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Gestiona proveedores, productos, cantidades, descuentos y totales desde un flujo centralizado.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSupplierHistorySearch('');
              setIsSupplierHistoryOpen(true);
              void refreshOrderHistory();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg border transition-colors ${
              darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-gray-200 text-slate-700 hover:bg-gray-50'
            }`}
          >
            <History size={16} />
            Historial de compras
          </button>
          <button
            type="button"
            onClick={() => setIsQuickSupplierOpen(true)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg border transition-colors ${
              darkMode ? 'border-slate-700 text-teal-300 hover:bg-slate-800' : 'border-teal-200 text-teal-700 hover:bg-teal-50'
            }`}
          >
            <UserPlus size={16} />
            Nuevo proveedor
          </button>
          <button 
            disabled={savingOrder} onClick={handleSaveOrder}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg text-white transition-colors shadow-sm"
            style={{ backgroundColor: tealColor }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#00a884'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = tealColor}
          >
            <Receipt size={16} strokeWidth={2.5} />
            Grabar orden
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        
        {/* Left Column - Forms */}
        <div className="flex-1 w-full space-y-6">
          
          {/* 01. Detalle de productos */}
          <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} rounded-2xl border shadow-sm overflow-hidden`}>
            <div className="px-6 py-4 flex items-center gap-4">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-sm"
                style={{ backgroundColor: tealBadge }}
              >
                01
              </div>
              <div>
                <h3 className={`text-[17px] font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Detalle de productos</h3>
                <p className={`text-[13px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{products.length} items registrados. Solo cantidad y precio son editables.</p>
              </div>
            </div>

            <div className="p-6 pt-2">
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${darkMode ? 'text-slate-300' : 'text-[#2d3436]'}`}>PRODUCTO</label>
                  <div className="relative">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} size={16} />
                    <input 
                      type="text" 
                      placeholder="Seleccionar o buscar producto..." 
                      value={searchQuery}
                      onChange={(e) => {
                        setSelectedProduct(null);
                        setSearchQuery(e.target.value);
                        setShowProductDropdown(true);
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                      onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                      className={`w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#00b894]/30 focus:border-[#00b894] transition-all ${
                        darkMode ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-200 text-[#2d3436]'
                      }`}
                    />

                    {/* Dropdown de opciones de productos */}
                    {showProductDropdown && <ProductSearchResults products={filteredProducts} purchase={true} onSelect={p => { setSelectedProduct(p); setSearchQuery(p.descripcion); setInputPrecio(p.costoUnitario > 0 ? String(p.costoUnitario) : String(p.precioVenta)); setShowProductDropdown(false); }} />}
                  </div>
                </div>
                <div className="w-full md:w-32">
                  <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${darkMode ? 'text-slate-300' : 'text-[#2d3436]'}`}>CANTIDAD</label>
                  <input 
                    type="number" 
                    placeholder="0.00" 
                    value={inputCant}
                    onChange={(e) => setInputCant(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#00b894]/30 focus:border-[#00b894] transition-all ${
                      darkMode ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-200 text-[#2d3436]'
                    }`}
                  />
                </div>
                <div className="w-full md:w-32">
                  <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${darkMode ? 'text-slate-300' : 'text-[#2d3436]'}`}>PRECIO UNITARIO</label>
                  <input 
                    type="number" 
                    placeholder="0.00" 
                    value={inputPrecio}
                    onChange={(e) => setInputPrecio(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#00b894]/30 focus:border-[#00b894] transition-all ${
                      darkMode ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-200 text-[#2d3436]'
                    }`}
                  />
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={handleAddProduct}
                    className="h-[42px] px-6 flex items-center gap-2 rounded-lg text-white font-bold text-sm transition-colors shadow-sm"
                    style={{ backgroundColor: tealColor }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#00a884'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = tealColor}
                  >
                    <Plus size={18} /> Agregar
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className={`border rounded-xl overflow-hidden ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                <table className="w-full text-left text-sm">
                  <thead className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                    <tr>
                      <th className={`px-5 py-3 text-xs font-bold border-b ${darkMode ? 'text-slate-300 border-slate-800' : 'text-[#2d3436] border-gray-200'}`}>CÓDIGO</th>
                      <th className={`px-5 py-3 text-xs font-bold border-b ${darkMode ? 'text-slate-300 border-slate-800' : 'text-[#2d3436] border-gray-200'}`}>DESCRIPCIÓN</th>
                      <th className={`px-5 py-3 text-xs font-bold border-b ${darkMode ? 'text-slate-300 border-slate-800' : 'text-[#2d3436] border-gray-200'}`}>UNIDAD</th>
                      <th className={`px-5 py-3 text-xs font-bold border-b text-right ${darkMode ? 'text-slate-300 border-slate-800' : 'text-[#2d3436] border-gray-200'}`}>CANT.</th>
                      <th className={`px-5 py-3 text-xs font-bold border-b text-right ${darkMode ? 'text-slate-300 border-slate-800' : 'text-[#2d3436] border-gray-200'}`}>P. UNITARIO</th>
                      <th className={`px-5 py-3 text-xs font-bold border-b text-right ${darkMode ? 'text-slate-300 border-slate-800' : 'text-[#2d3436] border-gray-200'}`}>IMPORTE</th>
                      <th className={`px-3 py-3 border-b w-10 ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}></th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-slate-800 bg-slate-900' : 'divide-gray-100 bg-white'}`}>
                    <AnimatePresence>
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-16 text-center">
                            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-3 ${darkMode ? 'bg-slate-800 text-slate-500' : 'bg-gray-50 text-gray-300'}`}>
                              <Package size={28} />
                            </div>
                            <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>No hay productos agregados a la orden.</p>
                          </td>
                        </tr>
                      ) : (
                        products.map((p) => (
                          <motion.tr 
                            initial={{ opacity: 0, backgroundColor: darkMode ? '#0f172a' : '#f0fdf4' }}
                            animate={{ opacity: 1, backgroundColor: 'transparent' }}
                            exit={{ opacity: 0, height: 0 }}
                            key={p.id} 
                            className={`group transition-colors ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}
                          >
                            <td className={`px-5 py-3.5 text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{p.codigo}</td>
                            <td className={`px-5 py-3.5 text-sm font-medium ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>{p.descripcion}</td>
                            <td className={`px-5 py-3.5 text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{p.unidad}</td>
                            <td className={`px-5 py-3.5 text-right text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{p.cantidad.toFixed(2)}</td>
                            <td className={`px-5 py-3.5 text-right text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{formatCurrency(p.precioUnitario)}</td>
                            <td className={`px-5 py-3.5 text-right text-sm font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>{formatCurrency(p.importe)}</td>
                            <td className="px-3 py-3.5">
                              <button 
                                onClick={() => removeProduct(p.id)}
                                className={`transition-colors opacity-0 group-hover:opacity-100 ${darkMode ? 'text-slate-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 02. Condiciones económicas */}
          <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} rounded-2xl border shadow-sm overflow-hidden`}>
            <div className="px-6 py-4 flex items-center gap-4">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-sm"
                style={{ backgroundColor: tealBadge }}
              >
                02
              </div>
              <div>
                <h3 className={`text-[17px] font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Condiciones económicas</h3>
                <p className={`text-[13px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Descuentos y valores aplicados a la operación.</p>
              </div>
            </div>
            
            <div className="p-6 grid md:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-slate-300' : 'text-[#2d3436]'}`}>DESCUENTO GLOBAL</label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-[#1e272e] text-white'}`}>PEN</span>
                </div>
                <p className={`text-[13px] mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Se aplica antes de calcular el IGV</p>
                <div className="relative">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>S/</span>
                  <input 
                    type="number" 
                    placeholder="0.00" 
                    value={descuentoGlobal}
                    onChange={(e) => setDescuentoGlobal(e.target.value)}
                    className={`w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#00b894]/30 focus:border-[#00b894] transition-all ${
                      darkMode ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-200 text-[#2d3436]'
                    }`}
                  />
                </div>
              </div>
              <div className={`p-4 rounded-xl border flex gap-3 ${darkMode ? 'bg-blue-900/20 border-blue-900/50' : 'bg-[#f0f7ff] border-blue-100'}`}>
                <Receipt className="text-blue-500 shrink-0 mt-0.5" size={20} />
                <p className={`text-[13px] leading-relaxed ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                  Verifica cantidades y precios directamente en la tabla. Los importes y el total se actualizan automáticamente.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Summary */}
        <div className="w-full xl:w-[380px] shrink-0 space-y-6">
          
          {/* Proveedor */}
          <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} rounded-2xl border shadow-sm p-6`}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Datos del proveedor <span className="text-red-500">*</span></h3>
                <p className={`text-[13px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Obligatorio para grabar la orden</p>
              </div>
              <Building2 className={`${darkMode ? 'text-slate-600' : 'text-gray-300'}`} size={20} />
            </div>
            
            {selectedProveedor ? (
              <div 
                className={`w-full p-4 rounded-xl border relative transition-all ${
                  darkMode ? 'border-teal-500/30 bg-teal-500/5' : 'border-[#00b894]/30 bg-[#00b894]/5'
                }`}
              >
                {/* Cabecera del proveedor */}
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-1 ${
                      selectedProveedor.tipo_persona === 'JURIDICA'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    }`}>
                      {selectedProveedor.tipo_persona === 'JURIDICA' ? 'Persona Jurídica' : 'Persona Natural'}
                    </span>
                    <p className={`text-sm font-bold leading-snug ${darkMode ? 'text-teal-400' : 'text-[#00b894]'}`}>
                      {selectedProveedor.nombre}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="p-1.5 rounded-lg bg-white/70 dark:bg-slate-800 text-slate-500 hover:text-teal-600 transition-colors shrink-0 shadow-sm"
                    title="Cambiar proveedor"
                  >
                    <Search size={14} />
                  </button>
                </div>

                {/* Detalles completos solicitados */}
                <div className={`space-y-1.5 text-xs border-t pt-2.5 ${darkMode ? 'border-slate-800' : 'border-[#00b894]/15'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">{selectedProveedor.tipo_documento || (selectedProveedor.documento?.length === 8 ? 'DNI' : 'RUC')}:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedProveedor.documento || selectedProveedor.ruc}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">Condición / Crédito:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedProveedor.condicion}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">Teléfono:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedProveedor.telefono || 'No registrado'}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">Correo:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[190px]" title={selectedProveedor.email}>
                      {selectedProveedor.email || 'No registrado'}
                    </span>
                  </div>

                  <div className="flex justify-between items-start">
                    <span className="text-slate-400 font-medium shrink-0">Dirección:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 text-right truncate max-w-[190px]" title={selectedProveedor.direccion}>
                      {selectedProveedor.direccion || 'No registrada'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-400 font-medium">Estado:</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      {selectedProveedor.estado || 'Activo'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsModalOpen(true)}
                  className="w-full mt-3 py-1.5 text-center text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline bg-teal-50/60 dark:bg-teal-950/40 rounded-lg transition-colors"
                >
                  Cambiar proveedor seleccionado
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsModalOpen(true)}
                className={`w-full py-3.5 px-4 rounded-xl border flex items-center gap-3 transition-all shadow-sm ${
                  darkMode ? 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-gray-50 border-gray-100 text-gray-400'
                }`}>
                  <Search size={16} />
                </div>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Seleccionar un proveedor</p>
                  <p className={`text-[12px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Selecciona un proveedor para poder grabar la orden.</p>
                </div>
              </button>
            )}
          </div>

          {/* Resumen */}
          <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} rounded-2xl border shadow-sm p-6`}>
            <h3 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Resumen de la orden</h3>
            <p className={`text-[13px] mt-0.5 mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Cálculo automático de la operación</p>

            <div className={`space-y-3.5 pb-5 border-b text-[14px] ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
              <div className={`flex justify-between ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                <span>Subtotal</span>
                <span className={`font-medium ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>{formatCurrency(subtotal)}</span>
              </div>
              <div className={`flex justify-between ${darkMode ? 'text-red-400' : 'text-[#ff7675]'}`}>
                <span>Descuento</span>
                <span>- {formatCurrency(descValue)}</span>
              </div>
              <div className={`flex justify-between ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                <span>IGV (18%)</span>
                <span className={`font-medium ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>{formatCurrency(igv)}</span>
              </div>
              <div className={`flex justify-between ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                <span>Otros cargos</span>
                <span className={`font-medium ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>S/ 0.00</span>
              </div>
            </div>

            <div className="pt-5 mb-6">
              <div className="flex justify-between items-end">
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-1.5 ${darkMode ? 'text-slate-300' : 'text-[#2d3436]'}`}>TOTAL ORDEN</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-[#1e272e] text-white'}`}>PEN</span>
                </div>
                <span className={`text-[28px] font-black leading-none ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            <button 
              disabled={savingOrder} onClick={handleSaveOrder}
              className="w-full py-3.5 rounded-xl text-white font-bold text-base transition-colors shadow-sm mb-4"
              style={{ backgroundColor: tealColor }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#00a884'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = tealColor}
            >
              Grabar orden de compra
            </button>
            <p className={`text-[12px] leading-relaxed text-center px-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
              Al grabar podrás decidir si la operación genera automáticamente el movimiento en Kardex.
            </p>
          </div>

        </div>
      </div>

      <section className={`overflow-hidden rounded-2xl border shadow-sm ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
        <div className={`flex items-center justify-between border-b px-6 py-4 ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
          <div>
            <h2 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>Órdenes de compra recientes</h2>
            <p className={`mt-1 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Consulta los productos y totales de cada pedido.</p>
          </div>
          <button type="button" onClick={() => void refreshOrderHistory()} aria-label="Actualizar órdenes de compra" className={`rounded-lg border p-2 text-sm ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-slate-600 hover:bg-gray-50'}`}>
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className={darkMode ? 'bg-slate-800/60 text-slate-400' : 'bg-gray-50 text-gray-500'}>
              <tr>
                <th className="px-6 py-3 text-xs font-semibold uppercase">Orden</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase">Proveedor</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase">Fecha</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase">Total</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase">Detalles</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-gray-100'}`}>
              {orderHistory.slice(0, 10).map((order, index) => (
                <tr key={order.id || order.codigo || index}>
                  <td className={`px-6 py-3 font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{order.codigo}</td>
                  <td className={`px-6 py-3 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{order.proveedor_nombre}</td>
                  <td className={`px-6 py-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{new Date(order.fecha_emision).toLocaleDateString('es-PE')}</td>
                  <td className={`px-6 py-3 text-right font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(order.total)}</td>
                  <td className="px-6 py-3 text-center">
                    <button type="button" disabled={generatingPending} onClick={() => void generatePending(order)} className="mr-2 rounded-lg border px-2 py-1 text-xs">Generar pendiente</button>
                    <button
                      type="button"
                      onClick={() => setSelectedOrderDetails({
                        number: order.codigo,
                        partyName: order.proveedor_nombre,
                        document: order.proveedor_documento,
                        date: order.fecha_emision,
                        status: order.estado,
                        subtotal: order.subtotal,
                        tax: order.igv,
                        total: order.total,
                        notes: order.observaciones,
                        lines: (order.items || []).map(item => ({
                          code: item.producto_codigo,
                          description: item.producto_descripcion,
                          quantity: item.cantidad,
                          unitPrice: item.costo_unitario,
                          amount: item.subtotal
                        }))
                      })}
                      aria-label={`Ver detalles de la orden ${order.codigo}`}
                      title="Ver detalles"
                      className="rounded-lg p-2 text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-slate-800"
                    >
                      <Eye size={17} />
                    </button>
                  </td>
                </tr>
              ))}
              {orderHistory.length === 0 && (
                <tr><td colSpan={5} className={`px-6 py-8 text-center text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Aún no hay órdenes de compra registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isSupplierHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Historial de compras por proveedor"
            className={`my-auto w-full max-w-5xl overflow-hidden rounded-2xl border shadow-2xl ${
              darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-gray-200 bg-white text-slate-900'
            }`}
          >
            <header className={`flex items-center justify-between border-b px-6 py-4 ${
              darkMode ? 'border-slate-800' : 'border-gray-100'
            }`}>
              <div className="flex items-center gap-3">
                <History className="text-teal-500" size={20} />
                <div>
                  <h2 className="text-lg font-bold">Historial de compras por proveedor</h2>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Busca por nombre, DNI o RUC para ver todas sus órdenes de compra.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSupplierHistoryOpen(false)}
                aria-label="Cerrar historial de compras"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </header>

            <div className="space-y-4 p-6">
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} size={17} />
                <input
                  type="search"
                  value={supplierHistorySearch}
                  onChange={event => setSupplierHistorySearch(event.target.value)}
                  placeholder="Escribe el nombre, DNI o RUC del proveedor..."
                  aria-label="Buscar órdenes por proveedor"
                  className={`w-full rounded-xl border py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-teal-500/30 ${
                    darkMode ? 'border-slate-700 bg-slate-950 text-white placeholder-slate-500' : 'border-gray-300 bg-white text-slate-900'
                  }`}
                />
              </div>

              <div className={`overflow-x-auto rounded-xl border ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className={darkMode ? 'bg-slate-800/70 text-slate-400' : 'bg-gray-50 text-gray-500'}>
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase">Orden</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase">Proveedor</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase">DNI / RUC</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase">Fecha</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase">Estado</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-gray-100'}`}>
                    {!supplierHistorySearch.trim() ? (
                      <tr>
                        <td colSpan={7} className={`px-4 py-10 text-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Ingresa el nombre, DNI o RUC del proveedor para consultar su historial.
                        </td>
                      </tr>
                    ) : filteredSupplierOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={`px-4 py-10 text-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          No se encontraron órdenes de compra para “{supplierHistorySearch}”.
                        </td>
                      </tr>
                    ) : filteredSupplierOrders.map((order, index) => {
                      const supplier = getOrderSupplier(order);
                      const document = order.proveedor_documento || supplier?.documento || supplier?.ruc || '—';
                      const orderDate = new Date(order.fecha_emision);
                      const dateLabel = Number.isNaN(orderDate.getTime())
                        ? order.fecha_emision
                        : orderDate.toLocaleDateString('es-PE');

                      return (
                        <tr key={order.id || order.codigo || index}>
                          <td className={`px-4 py-3 font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{order.codigo}</td>
                          <td className={`px-4 py-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{order.proveedor_nombre}</td>
                          <td className={`px-4 py-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{document}</td>
                          <td className={`px-4 py-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{dateLabel}</td>
                          <td className="px-4 py-3">{order.estado}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(order.total)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedOrderDetails({
                                number: order.codigo,
                                partyName: order.proveedor_nombre,
                                document: document === '—' ? undefined : document,
                                date: order.fecha_emision,
                                status: order.estado,
                                subtotal: order.subtotal,
                                tax: order.igv,
                                total: order.total,
                                notes: order.observaciones,
                                lines: (order.items || []).map(item => ({
                                  code: item.producto_codigo,
                                  description: item.producto_descripcion,
                                  quantity: item.cantidad,
                                  unitPrice: item.costo_unitario,
                                  amount: item.subtotal
                                }))
                              })}
                              aria-label={`Ver detalle de la orden ${order.codigo}`}
                              title="Ver detalle"
                              className="rounded-lg p-2 text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-slate-800"
                            >
                              <Eye size={17} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

      {isQuickSupplierOpen && (
        <QuickPartyCreateModal
          kind="proveedor"
          darkMode={darkMode}
          onClose={() => setIsQuickSupplierOpen(false)}
          onCreated={party => {
            if (!('condicion_pago' in party)) return;
            const mappedProveedor = mapProveedorForOrder(party);
            setProveedoresDB(current => [mappedProveedor, ...current]);
            setSelectedProveedor(mappedProveedor);
            setIsModalOpen(false);
            setProveedorSearch('');
          }}
        />
      )}
      {selectedOrderDetails && (
        <OrderDetailsModal
          title="Detalle de orden de compra"
          order={selectedOrderDetails}
          darkMode={darkMode}
          onClose={() => setSelectedOrderDetails(null)}
        />
      )}

      {/* Modal Buscar Proveedor */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`relative w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}
            >
              {/* Modal Header */}
              <div className={`px-6 py-4 flex items-center justify-between border-b ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-slate-800 text-teal-400' : 'bg-teal-50 text-[#00b894]'}`}>
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>Buscar proveedor</h3>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Busca un proveedor registrado para usarlo en la nueva orden.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className={`text-gray-400 hover:text-gray-600 transition-colors ${darkMode ? 'hover:text-white' : ''}`}
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                <div className="relative mb-6">
                  <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} size={18} />
                  <input 
                    type="text" 
                    placeholder="Proveedor / RUC / DNI / Correo" 
                    value={proveedorSearch}
                    onChange={(e) => setProveedorSearch(e.target.value)}
                    className={`w-full pl-11 pr-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#00b894]/30 focus:border-[#00b894] transition-all ${
                      darkMode ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-gray-300 text-[#2d3436]'
                    }`}
                  />
                </div>

                <div className={`border rounded-xl overflow-hidden ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                  <table className="w-full text-left text-xs table-fixed">
                    <thead className={`${darkMode ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
                      <tr>
                        <th className={`w-[28%] px-4 py-3 font-bold border-b ${darkMode ? 'text-slate-400 border-slate-800' : 'text-gray-500 border-gray-200'}`}>PROVEEDOR / TIPO</th>
                        <th className={`w-[14%] px-4 py-3 font-bold border-b ${darkMode ? 'text-slate-400 border-slate-800' : 'text-gray-500 border-gray-200'}`}>DOCUMENTO</th>
                        <th className={`w-[22%] px-4 py-3 font-bold border-b ${darkMode ? 'text-slate-400 border-slate-800' : 'text-gray-500 border-gray-200'}`}>CONTACTO</th>
                        <th className={`w-[18%] px-4 py-3 font-bold border-b ${darkMode ? 'text-slate-400 border-slate-800' : 'text-gray-500 border-gray-200'}`}>DIRECCIÓN</th>
                        <th className={`w-[10%] px-4 py-3 font-bold border-b ${darkMode ? 'text-slate-400 border-slate-800' : 'text-gray-500 border-gray-200'}`}>CONDICIÓN</th>
                        <th className={`w-[8%] px-4 py-3 font-bold border-b text-center ${darkMode ? 'text-slate-400 border-slate-800' : 'text-gray-500 border-gray-200'}`}>ESTADO</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-gray-100'}`}>
                      {proveedoresDB.filter(p => 
                        p.nombre.toLowerCase().includes(proveedorSearch.toLowerCase()) || 
                        (p.documento && p.documento.includes(proveedorSearch)) ||
                        (p.ruc && p.ruc.includes(proveedorSearch)) ||
                        (p.email && p.email.toLowerCase().includes(proveedorSearch.toLowerCase())) ||
                        (p.telefono && p.telefono.includes(proveedorSearch))
                      ).map(prov => (
                        <tr 
                          key={prov.id || prov.documento || prov.ruc}
                          onClick={() => {
                            setSelectedProveedor(prov);
                            setIsModalOpen(false);
                            setProveedorSearch('');
                          }}
                          className={`cursor-pointer transition-colors ${
                            darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-teal-50/50'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <p className={`font-bold truncate ${darkMode ? 'text-white' : 'text-slate-800'}`} title={prov.nombre}>{prov.nombre}</p>
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase mt-0.5 ${
                              prov.tipo_persona === 'JURIDICA'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            }`}>
                              {prov.tipo_persona === 'JURIDICA' ? 'Persona Jurídica' : 'Persona Natural'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {prov.tipo_documento || (prov.documento?.length === 8 ? 'DNI' : 'RUC')}: {prov.documento || prov.ruc}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                            <p className="font-medium text-slate-700 dark:text-slate-300">{prov.telefono}</p>
                            <p className="text-[10px] text-slate-400 truncate" title={prov.email}>{prov.email}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                            <p className="truncate text-xs" title={prov.direccion}>{prov.direccion}</p>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                            {prov.condicion}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00b894]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#00b894]"></span> {prov.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {proveedoresDB.filter(p => 
                        p.nombre.toLowerCase().includes(proveedorSearch.toLowerCase()) || 
                        (p.documento && p.documento.includes(proveedorSearch)) ||
                        (p.ruc && p.ruc.includes(proveedorSearch)) ||
                        (p.email && p.email.toLowerCase().includes(proveedorSearch.toLowerCase()))
                      ).length === 0 && (
                        <tr>
                          <td colSpan={6} className={`px-5 py-8 text-center text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                            No se encontraron proveedores que coincidan con la búsqueda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Footer */}
              <div className={`px-6 py-4 border-t flex justify-end ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-gray-100 bg-gray-50'}`}>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setProveedorSearch('');
                  }}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-colors border ${
                    darkMode ? 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Simple (Avisos rápidos) */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-6 bg-emerald-500 text-white px-5 py-4 rounded-xl shadow-lg flex items-center gap-3 z-50 min-w-[300px]"
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
