import { DuplicateNotice } from '../../components/masters/DuplicateNotice';
import { ProductMasterModal } from '../../components/ProductMasterModal';
import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Boxes, Plus, Search, AlertTriangle, ArrowRightLeft, 
  Download, Edit2, Trash2, PackageCheck, Layers, Package
} from 'lucide-react';
import { inventarioService, type Producto } from '../../services/inventarioService';

export const StockProductosPage = ({ masterMode = false }: { masterMode?: boolean }) => {
  const { darkMode } = useOutletContext<{ darkMode: boolean }>();
  const navigate = useNavigate();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('TODAS');
  const [estadoFilter, setEstadoFilter] = useState<'TODOS' | 'NORMAL' | 'BAJO' | 'AGOTADO'>('TODOS');
  
  // Modal de Nuevo / Editar Producto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadProductos = async () => {
    const data = await inventarioService.getProductos();
    setProductos(data);
  };

  useEffect(() => {
    loadProductos();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // KPIs
  const totalItems = productos.length;
  const totalUnidades = productos.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);
  const valorizacionTotal = productos.reduce((acc, p) => acc + ((Number(p.stock) || 0) * (Number(p.costoUnitario) || 0)), 0);
  const stockCriticoCount = productos.filter(p => (Number(p.stock) || 0) <= (Number(p.stockMinimo) || 0)).length;

  const categorias = useMemo(() => {
    const set = new Set<string>();
    productos.forEach(p => { if (p.categoria) set.add(p.categoria); });
    return Array.from(set);
  }, [productos]);

  const filteredProductos = useMemo(() => {
    return productos.filter(p => {
      const matchSearch = p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.categoria.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchCat = categoriaFilter === 'TODAS' || p.categoria === categoriaFilter;

      let matchEstado = true;
      if (estadoFilter === 'NORMAL') matchEstado = p.stock > p.stockMinimo;
      if (estadoFilter === 'BAJO') matchEstado = p.stock <= p.stockMinimo && p.stock > 0;
      if (estadoFilter === 'AGOTADO') matchEstado = p.stock === 0;

      return matchSearch && matchCat && matchEstado;
    });
  }, [productos, searchTerm, categoriaFilter, estadoFilter]);

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Producto) => {
    setEditingProduct(p);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de eliminar el producto "${name}" del catálogo?`)) {
      await inventarioService.deleteProducto(id);
      await loadProductos();
      showToast(`Producto ${name} eliminado.`);
    }
  };

  const exportCSV = () => {
    const fechaGeneracion = new Date().toLocaleString('es-PE');
    const lines: string[] = [
      'ERP SENATINO - REPORTE DE INVENTARIO Y STOCK VALORIZADO',
      `FECHA DE GENERACIÓN: ${fechaGeneracion}`,
      `ALMACÉN: Almacén Central | MONEDA: SOLES (PEN - S/)`,
      `TOTAL PRODUCTOS (SKU): ${totalItems} | UNIDADES FÍSICAS: ${totalUnidades}`,
      `VALORIZACIÓN TOTAL DEL INVENTARIO: S/ ${valorizacionTotal.toFixed(2)}`,
      '',
      ['N°', 'Código SKU', 'Descripción del Producto', 'Categoría', 'Almacén', 'U.M.', 'Costo Unit. (S/)', 'Precio Venta (S/)', 'Stock Disponible', 'Stock Mínimo', 'Valor Total (S/)', 'Condición Stock'].join(';')
    ];

    filteredProductos.forEach((p, idx) => {
      const sanitizedDesc = p.descripcion.replace(/"/g, '""');
      const isBajo = p.stock <= p.stockMinimo && p.stock > 0;
      const isAgotado = p.stock === 0;
      const condicion = isAgotado ? 'AGOTADO' : (isBajo ? 'BAJO STOCK' : 'NORMAL');
      const valorTotal = (p.stock * p.costoUnitario).toFixed(2);

      lines.push([
        String(idx + 1),
        `"${p.codigo}"`,
        `"${sanitizedDesc}"`,
        `"${p.categoria}"`,
        `"${p.almacen}"`,
        `"${p.unidad}"`,
        p.costoUnitario.toFixed(2),
        p.precioVenta.toFixed(2),
        String(p.stock),
        String(p.stockMinimo),
        valorTotal,
        `"${condicion}"`
      ].join(';'));
    });

    lines.push('');
    lines.push(['', '', 'TOTAL GENERAL', '', '', '', '', '', String(totalUnidades), '', valorizacionTotal.toFixed(2), ''].join(';'));

    const csvContent = lines.join('\r\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Stock_Valorizado_ERP_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (val: number | undefined | null) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    return `S/ ${num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1400px] mx-auto pb-10 font-sans">
      
      <DuplicateNotice records={productos.map(record => ({ id: record.id, key: record.codigo }))} />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 mt-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mb-1.5 text-blue-500">
            <span>ERP</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span>INVENTARIOS</span>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span className="text-gray-400 dark:text-slate-500">STOCK DE PRODUCTOS</span>
          </div>
          <h1 className={`text-[26px] font-bold tracking-tight leading-none ${darkMode ? 'text-white' : 'text-[#2d3436]'}`}>
            {masterMode ? 'Maestros · Productos' : 'Stock de productos'}
          </h1>
          <p className={`mt-2 text-[13px] ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Monitoreo en tiempo real de existencias, almacenes, costos y valorización de inventario.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/ingreso-kardex')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors border shadow-sm ${
              darkMode ? 'bg-slate-800 border-slate-700 text-teal-400 hover:bg-slate-700' : 'bg-white border-gray-200 text-teal-600 hover:bg-gray-50'
            }`}
          >
            <PackageCheck size={16} />
            Ingreso a Kardex
          </button>
          <button 
            onClick={() => navigate('/movimiento-kardex')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors border shadow-sm ${
              darkMode ? 'bg-slate-800 border-slate-700 text-sky-400 hover:bg-slate-700' : 'bg-white border-gray-200 text-sky-600 hover:bg-gray-50'
            }`}
          >
            <ArrowRightLeft size={16} />
            Ver Kardex
          </button>
          <button 
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all"
          >
            <Plus size={16} strokeWidth={2.5} />
            Nuevo producto
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex justify-between items-start mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Productos Activos</span>
            <div className={`p-2 rounded-lg ${darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><Boxes size={18} /></div>
          </div>
          <h3 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{totalItems} SKU</h3>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Referencias en catálogo</p>
        </div>

        <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex justify-between items-start mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>Unidades Físicas</span>
            <div className={`p-2 rounded-lg ${darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}><Layers size={18} /></div>
          </div>
          <h3 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{totalUnidades} UND</h3>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Existencias totales disponibles</p>
        </div>

        <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex justify-between items-start mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Valorización Total</span>
            <div className={`p-2 rounded-lg ${darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>S/</div>
          </div>
          <h3 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(valorizacionTotal)}</h3>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Al costo promedio de inventario</p>
        </div>

        <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex justify-between items-start mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${stockCriticoCount > 0 ? 'text-amber-500' : 'text-slate-400'}`}>Stock Crítico</span>
            <div className={`p-2 rounded-lg ${stockCriticoCount > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <h3 className={`text-2xl font-black ${stockCriticoCount > 0 ? 'text-amber-500' : darkMode ? 'text-white' : 'text-slate-900'}`}>
            {stockCriticoCount} SKU
          </h3>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Por debajo o igual al mínimo</p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className={`p-4 rounded-2xl border mb-6 flex flex-col md:flex-row items-center justify-between gap-4 ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="relative flex-1 w-full">
          <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={16} />
          <input 
            type="text" 
            placeholder="Buscar por código, descripción o categoría..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
              darkMode ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select 
            value={categoriaFilter}
            onChange={(e) => setCategoriaFilter(e.target.value)}
            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none ${
              darkMode ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <option value="TODAS">Todas las Categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select 
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value as any)}
            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none ${
              darkMode ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <option value="TODOS">Todos los Estados</option>
            <option value="NORMAL">Stock Normal</option>
            <option value="BAJO">Stock Crítico</option>
            <option value="AGOTADO">Agotado</option>
          </select>

          <button 
            onClick={exportCSV}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-colors ${
              darkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Download size={14} />
            Exportar
          </button>
        </div>
      </div>

      {/* Tabla de Productos */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={`text-xs uppercase tracking-wider font-bold ${darkMode ? 'bg-slate-800/50 text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'} border-b`}>
              <tr>
                <th className="px-5 py-3.5">Código</th>
                <th className="px-5 py-3.5">Descripción</th>
                <th className="px-5 py-3.5">Categoría</th>
                <th className="px-5 py-3.5">Almacén</th>
                <th className="px-5 py-3.5 text-right">Costo Unit.</th>
                <th className="px-5 py-3.5 text-right">P. Venta</th>
                <th className="px-5 py-3.5 text-right">Stock Actual</th>
                <th className="px-5 py-3.5 text-right">Mínimo</th>
                <th className="px-5 py-3.5 text-right">Valor Total</th>
                <th className="px-5 py-3.5 text-center">Estado</th>
                {masterMode && <th className="px-5 py-3.5">Acciones</th>}
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
              <AnimatePresence>
                {filteredProductos.length === 0 ? (
                  <tr>
                    <td colSpan={masterMode ? 11 : 10} className="py-16 text-center">
                      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 ${darkMode ? 'bg-slate-800 text-slate-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Package size={24} />
                      </div>
                      <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No se encontraron productos coincidentes.</p>
                    </td>
                  </tr>
                ) : (
                  filteredProductos.map((prod) => {
                    const isBajo = prod.stock <= prod.stockMinimo && prod.stock > 0;
                    const isAgotado = prod.stock === 0;

                    return (
                      <motion.tr 
                        key={prod.id} 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`transition-colors ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-5 py-3.5 font-mono text-xs font-bold text-blue-500">{prod.codigo}</td>
                        <td className={`px-5 py-3.5 font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                          <div>{prod.descripcion}</div>
                          <span className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{prod.unidad}</span>
                        </td>
                        <td className={`px-5 py-3.5 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          <span className={`px-2 py-0.5 rounded-md font-medium text-[11px] ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                            {prod.categoria}
                          </span>
                        </td>
                        <td className={`px-5 py-3.5 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{prod.almacen}</td>
                        <td className={`px-5 py-3.5 text-right text-xs ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{formatCurrency(prod.costoUnitario)}</td>
                        <td className={`px-5 py-3.5 text-right text-xs font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(prod.precioVenta)}</td>
                        <td className="px-5 py-3.5 text-right font-black text-sm">
                          <span className={isAgotado ? 'text-rose-500' : isBajo ? 'text-amber-500' : darkMode ? 'text-emerald-400' : 'text-emerald-600'}>
                            {prod.stock}
                          </span>
                        </td>
                        <td className={`px-5 py-3.5 text-right text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{prod.stockMinimo}</td>
                        <td className={`px-5 py-3.5 text-right text-xs font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                          {formatCurrency(prod.stock * prod.costoUnitario)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {isAgotado ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                              Agotado
                            </span>
                          ) : isBajo ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                              Bajo Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                              Normal
                            </span>
                          )}
                        </td>
                        {masterMode && <td className="px-5 py-3.5"><button aria-label={`Editar ${prod.codigo}`} onClick={() => handleOpenEdit(prod)} className="p-2 text-blue-600"><Edit2 size={16} /></button><button aria-label={`Eliminar ${prod.codigo}`} onClick={() => void handleDelete(prod.id, prod.descripcion)} className="p-2 text-rose-600"><Trash2 size={16} /></button></td>}
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <ProductMasterModal key={editingProduct?.id ?? 'new'} editingProduct={editingProduct} darkMode={darkMode} onClose={() => setIsModalOpen(false)} onSaved={() => { void loadProductos(); showToast('Producto guardado.'); }} />}

      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 z-50">
            <PackageCheck size={18} />
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
