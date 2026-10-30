import { MasterSelect } from '../../components/masters/MasterSelect';
import { inventarioService, type Producto } from '../../services/inventarioService';
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, X, Save, FileText, XCircle, PlusCircle, Calculator } from 'lucide-react';
import { cotizacionesService } from '../../services/cotizacionesService';
import { clientesService } from '../../services/clientesService';
import type { Cotizacion, CotizacionFormData, CotizacionItem } from '../../services/cotizacionesService';
import type { Cliente } from '../../services/clientesService';

export const CotizacionesPage: React.FC = () => {
  const { darkMode } = useOutletContext<{ darkMode: boolean }>();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const initialFormState: CotizacionFormData = {
    cliente_id: '',
    cliente_nombre: '',
    fecha: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    validez_dias: 15,
    moneda: 'PEN',
    items: [],
    estado: 'Borrador',
    notas: ''
  };

  const [formData, setFormData] = useState<CotizacionFormData>(initialFormState);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setProductos(await inventarioService.getProductos());
    const dataCotizaciones = await cotizacionesService.getCotizaciones();
    const dataClientes = await clientesService.getClientes();
    setCotizaciones(dataCotizaciones);
    setClientes(dataClientes.filter(c => c.estado !== 'Inactivo' && !c.estado.includes('Suspendido')));
  };

  // Manejo general del formulario
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name === 'cliente_id') {
      const clienteSeleccionado = clientes.find(c => c.id === value);
      setFormData(prev => ({ 
        ...prev, 
        cliente_id: value,
        cliente_nombre: clienteSeleccionado ? clienteSeleccionado.nombre : ''
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Manejo de Items (Productos/Servicios en la cotización)
  const addItem = () => {
    const newItem: CotizacionItem = {
      id: Math.random().toString(36).substr(2, 9),
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      subtotal: 0
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const removeItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const updateItem = (id: string, field: keyof CotizacionItem, value: string | number) => {
    setFormData(prev => {
      const newItems = prev.items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          // Recalcular subtotal del item
          if (field === 'cantidad' || field === 'precio_unitario') {
            updatedItem.subtotal = Number(updatedItem.cantidad) * Number(updatedItem.precio_unitario);
          }
          return updatedItem;
        }
        return item;
      });
      return { ...prev, items: newItems };
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(initialFormState);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      alert("Debes agregar al menos un producto o servicio a la cotización.");
      return;
    }
    
    // Validar que no haya items vacíos
    const itemIncompleto = formData.items.find(i => !i.descripcion || i.precio_unitario <= 0 || i.cantidad <= 0);
    if (itemIncompleto) {
      alert("Por favor completa correctamente la descripción, cantidad y precio de todos los ítems.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        const actualizado = await cotizacionesService.updateCotizacion(editingId, formData);
        setCotizaciones(prev => prev.map(c => c.id === editingId ? actualizado : c));
      } else {
        const nueva = await cotizacionesService.createCotizacion(formData);
        setCotizaciones(prev => [...prev, nueva]);
      }
      closeModal();
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Hubo un error al guardar la cotización.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (cotizacion: Cotizacion) => {
    setFormData({
      cliente_id: cotizacion.cliente_id,
      cliente_nombre: cotizacion.cliente_nombre,
      fecha: cotizacion.fecha,
      validez_dias: cotizacion.validez_dias,
      moneda: cotizacion.moneda,
      items: [...cotizacion.items],
      estado: cotizacion.estado,
      notas: cotizacion.notas
    });
    setEditingId(cotizacion.id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, numero: string) => {
    if (window.confirm(`¿Estás seguro que deseas eliminar la cotización ${numero}?`)) {
      try {
        await cotizacionesService.deleteCotizacion(id);
        setCotizaciones(prev => prev.filter(c => c.id !== id));
      } catch (error) {
        alert("Error al eliminar.");
      }
    }
  };

  const handleCambiarEstado = async (id: string, estadoActual: string) => {
    // Ciclo simple para probar estados: Borrador -> Enviada -> Aprobada
    const estadosPermitidos: Cotizacion['estado'][] = ['Borrador', 'Enviada', 'Aprobada', 'Rechazada'];
    const currentIndex = estadosPermitidos.indexOf(estadoActual as any);
    const nextEstado = estadosPermitidos[(currentIndex + 1) % estadosPermitidos.length];
    
    try {
      const actualizada = await cotizacionesService.cambiarEstado(id, nextEstado);
      setCotizaciones(prev => prev.map(c => c.id === id ? actualizada : c));
    } catch (error) {
      alert("Error al cambiar de estado.");
    }
  };

  // Cálculos para la vista previa en el formulario
  const subtotalForm = formData.items.reduce((acc, item) => acc + item.subtotal, 0);
  const igvForm = subtotalForm * 0.18;
  const totalForm = subtotalForm + igvForm;

  const getBadgeColor = (estado: string) => {
    switch(estado) {
      case 'Aprobada': return darkMode ? 'bg-green-950/60 text-green-400 border-green-800/50' : 'bg-green-100 text-green-700 border-green-200';
      case 'Rechazada': return darkMode ? 'bg-red-950/60 text-red-400 border-red-800/50' : 'bg-red-100 text-red-700 border-red-200';
      case 'Enviada': return darkMode ? 'bg-blue-950/60 text-blue-400 border-blue-800/50' : 'bg-blue-100 text-blue-700 border-blue-200';
      default: return darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getSimboloMoneda = (moneda: string) => moneda === 'PEN' ? 'S/' : '$';

  const cotizacionesFiltradas = cotizaciones.filter(c => 
    c.numero.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.cliente_nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 relative">
      <div className={`flex justify-between items-center p-5 rounded-xl shadow-sm border transition-colors ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
      }`}>
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>Cotizaciones</h1>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Crea y gestiona presupuestos para tus clientes antes de convertirlos en ventas.</p>
        </div>
        <button 
          onClick={() => { setEditingId(null); setFormData(initialFormState); setIsModalOpen(true); }}
          className="bg-[#ff5a1f] hover:bg-[#e04712] text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm shadow-orange-200"
        >
          <Plus size={18} />
          <span>Nueva Cotización</span>
        </button>
      </div>

      <div className={`p-4 rounded-xl shadow-sm border flex gap-4 transition-colors ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
      }`}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por número o cliente..." 
            className={`w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#ff5a1f] transition-all ${
              darkMode 
                ? 'bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:bg-slate-800 focus:border-[#ff5a1f]' 
                : 'bg-gray-50 border border-gray-200 text-gray-900 focus:bg-white focus:border-[#ff5a1f]'
            }`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className={`rounded-xl shadow-sm border overflow-hidden transition-colors ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`border-b transition-colors ${
                darkMode ? 'bg-slate-800/80 border-slate-800' : 'bg-gray-50/80 border-gray-200'
              }`}>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Número</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Cliente</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Resumen / Productos</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Fecha</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-right ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Total</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Estado</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-right ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Acciones</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-gray-100'}`}>
              {cotizacionesFiltradas.map((cotizacion) => (
                <tr key={cotizacion.id} className={`transition-colors ${
                  darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-orange-50/30'
                }`}>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{cotizacion.numero}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>{cotizacion.cliente_nombre}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    <div className="truncate max-w-[200px]" title={cotizacion.items?.map(i => i.descripcion).join(', ')}>
                      {cotizacion.items?.length > 0 
                        ? (cotizacion.items.length === 1 
                            ? cotizacion.items[0].descripcion 
                            : `${cotizacion.items[0].descripcion} y ${cotizacion.items.length - 1} más...`)
                        : 'Sin ítems'}
                    </div>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    {new Date(cotizacion.fecha).toLocaleDateString('es-PE')}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {getSimboloMoneda(cotizacion.moneda)} {cotizacion.total.toLocaleString('es-PE', {minimumFractionDigits: 2})}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button 
                      onClick={() => handleCambiarEstado(cotizacion.id, cotizacion.estado)}
                      className={`px-3 py-1 inline-flex text-xs font-bold rounded-full border transition-all hover:opacity-80 ${getBadgeColor(cotizacion.estado)}`}
                      title="Clic para avanzar el estado"
                    >
                      {cotizacion.estado}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => handleEdit(cotizacion)} className={`mx-1 p-1.5 rounded-md transition-colors ${
                      darkMode ? 'text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20' : 'text-blue-500 hover:text-blue-700 bg-blue-50'
                    }`} title="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(cotizacion.id, cotizacion.numero)} className={`mx-1 p-1.5 rounded-md transition-colors ${
                      darkMode ? 'text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20' : 'text-red-500 hover:text-red-700 bg-red-50'
                    }`} title="Eliminar">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {cotizacionesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={7} className={`px-6 py-8 text-center ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    No se encontraron cotizaciones. Empieza creando una nueva.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE NUEVA COTIZACIÓN (Formulario Amplio) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm transition-opacity overflow-y-auto">
          <div className={`rounded-2xl shadow-xl w-full max-w-4xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200 border ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-100'
          }`}>
            <div className={`px-6 py-4 border-b flex justify-between items-center sticky top-0 z-10 ${
              darkMode ? 'bg-slate-800/90 backdrop-blur-md border-slate-800 text-white' : 'bg-gray-50/90 backdrop-blur-md border-gray-100 text-gray-800'
            }`}>
              <h2 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                <FileText size={20} className="text-[#ff5a1f]" />
                {editingId ? 'Editar Cotización' : 'Nueva Cotización'}
              </h2>
              <button onClick={closeModal} className={`transition-colors p-1 ${
                darkMode ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-500'
              }`} disabled={isSubmitting}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              
              {/* Sección 1: Datos Generales */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                <div className="md:col-span-2">
                  <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Cliente *</label>
                  <MasterSelect required name="cliente_id" aria-label="Cliente de la cotización" value={formData.cliente_id} onChange={handleInputChange} options={clientes.map(cliente => ({ id: cliente.id, label: `${cliente.documento} · ${cliente.nombre}` }))} />
                </div>
                
                <div>
                  <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Moneda</label>
                  <select name="moneda" value={formData.moneda} onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#ff5a1f] ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-[#ff5a1f]' : 'bg-white border-gray-300 text-gray-900 focus:border-[#ff5a1f]'
                    }`}
                  >
                    <option value="PEN" className={darkMode ? 'bg-slate-800 text-white' : ''}>Soles (PEN)</option>
                    <option value="USD" className={darkMode ? 'bg-slate-800 text-white' : ''}>Dólares (USD)</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Fecha Emisión *</label>
                  <input required type="date" name="fecha" value={formData.fecha} onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#ff5a1f] ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-[#ff5a1f]' : 'bg-white border-gray-300 text-gray-900 focus:border-[#ff5a1f]'
                    }`} 
                  />
                </div>

                <div>
                  <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Validez (Días)</label>
                  <input required type="number" name="validez_dias" value={formData.validez_dias} onChange={handleInputChange} min="1"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#ff5a1f] ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-[#ff5a1f]' : 'bg-white border-gray-300 text-gray-900 focus:border-[#ff5a1f]'
                    }`} 
                  />
                </div>
                
                <div>
                  <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Estado</label>
                  <select name="estado" value={formData.estado} onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#ff5a1f] ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-[#ff5a1f]' : 'bg-white border-gray-300 text-gray-900 focus:border-[#ff5a1f]'
                    }`}
                  >
                    <option value="Borrador" className={darkMode ? 'bg-slate-800 text-white' : ''}>Borrador</option>
                    <option value="Enviada" className={darkMode ? 'bg-slate-800 text-white' : ''}>Enviada</option>
                    <option value="Aprobada" className={darkMode ? 'bg-slate-800 text-white' : ''}>Aprobada</option>
                    <option value="Rechazada" className={darkMode ? 'bg-slate-800 text-white' : ''}>Rechazada</option>
                  </select>
                </div>
              </div>

              {/* Sección 2: Detalle de Ítems */}
              <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                  <h3 className={`text-md font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                    <Calculator size={18} className="text-gray-400" /> Detalle de Productos / Servicios
                  </h3>
                  <button type="button" onClick={addItem} className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors font-medium ${
                    darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}>
                    <PlusCircle size={16} /> Agregar Ítem
                  </button>
                </div>
                
                <div className={`border rounded-xl overflow-hidden ${
                  darkMode ? 'border-slate-800 bg-slate-800/40' : 'border-gray-200 bg-gray-50'
                }`}>
                  <table className="w-full text-left">
                    <thead className={`border-b text-xs uppercase ${
                      darkMode ? 'bg-slate-800/80 border-slate-800 text-slate-400' : 'bg-gray-100/80 border-gray-200 text-gray-500'
                    }`}>
                      <tr>
                        <th className="px-4 py-3 font-semibold">Descripción</th>
                        <th className="px-4 py-3 font-semibold w-24">Cant.</th>
                        <th className="px-4 py-3 font-semibold w-32">Precio Und.</th>
                        <th className="px-4 py-3 font-semibold w-32 text-right">Subtotal</th>
                        <th className="px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-slate-800 bg-slate-900' : 'divide-gray-200 bg-white'}`}>
                      {formData.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2">
                            <MasterSelect aria-label="Producto de la cotización" required={!item.descripcion} value={item.producto_id ?? ''}
                              placeholder={item.descripcion ? `Documento existente: ${item.descripcion}` : 'Seleccionar producto maestro'}
                              options={productos.map(product => ({ id: product.id, label: `${product.codigo} · ${product.descripcion}` }))}
                              onChange={event => {
                                const product = productos.find(product => product.id === event.target.value);
                                if (product) setFormData(prev => ({ ...prev, items: prev.items.map(line => line.id === item.id ? { ...line, producto_id: product.id, descripcion: product.descripcion, precio_unitario: product.precioVenta, subtotal: line.cantidad * product.precioVenta } : line) }));
                              }} />
                            {item.descripcion && <p className="mt-1 text-xs text-slate-500">{item.descripcion}</p>}
                          </td>
                          <td className="px-4 py-2">
                            <input type="number" required min="0.01" step="0.01"
                              value={item.cantidad || ''} onChange={(e) => updateItem(item.id, 'cantidad', parseFloat(e.target.value))}
                              className={`w-full px-2 py-1.5 border rounded focus:outline-none text-sm ${
                                darkMode 
                                  ? 'bg-slate-800 border-slate-700 text-white focus:border-[#ff5a1f]' 
                                  : 'border-gray-200 focus:border-[#ff5a1f]'
                              }`}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input type="number" required min="0.01" step="0.01"
                              value={item.precio_unitario || ''} onChange={(e) => updateItem(item.id, 'precio_unitario', parseFloat(e.target.value))}
                              className={`w-full px-2 py-1.5 border rounded focus:outline-none text-sm ${
                                darkMode 
                                  ? 'bg-slate-800 border-slate-700 text-white focus:border-[#ff5a1f]' 
                                  : 'border-gray-200 focus:border-[#ff5a1f]'
                              }`}
                            />
                          </td>
                          <td className={`px-4 py-2 text-right font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                            {item.subtotal.toLocaleString('es-PE', {minimumFractionDigits: 2})}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button type="button" onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 p-1">
                              <XCircle size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {formData.items.length === 0 && (
                        <tr>
                          <td colSpan={5} className={`px-4 py-8 text-center text-sm ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                            No hay ítems en la cotización. Presiona "Agregar Ítem".
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sección 3: Totales y Notas */}
              <div className="flex flex-col md:flex-row justify-between gap-8 mb-4">
                <div className="flex-1">
                  <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Notas / Condiciones Comerciales</label>
                  <textarea name="notas" value={formData.notas} onChange={handleInputChange} rows={3}
                    placeholder="Ej: El pago se realizará en 2 partes. Garantía de 1 año..."
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#ff5a1f] text-sm resize-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-[#ff5a1f]' : 'border-gray-300 focus:border-[#ff5a1f]'
                    }`} 
                  ></textarea>
                </div>
                
                <div className={`w-full md:w-72 p-4 rounded-xl border flex flex-col gap-2 ${
                  darkMode ? 'bg-orange-950/20 border-orange-900/40' : 'bg-orange-50/50 border-orange-100'
                }`}>
                  <div className={`flex justify-between text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    <span>Subtotal:</span>
                    <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>{getSimboloMoneda(formData.moneda)} {subtotalForm.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span>
                  </div>
                  <div className={`flex justify-between text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    <span>IGV (18%):</span>
                    <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>{getSimboloMoneda(formData.moneda)} {igvForm.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span>
                  </div>
                  <div className={`border-t my-1 pt-2 flex justify-between text-lg font-bold ${
                    darkMode ? 'border-orange-800/40 text-white' : 'border-orange-200/60 text-gray-900'
                  }`}>
                    <span>Total:</span>
                    <span>{getSimboloMoneda(formData.moneda)} {totalForm.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span>
                  </div>
                </div>
              </div>

              <div className={`pt-4 border-t flex justify-end gap-3 sticky bottom-0 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
              }`}>
                <button type="button" onClick={closeModal} disabled={isSubmitting}
                  className={`px-5 py-2.5 font-medium rounded-lg transition-colors ${
                    darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}>
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting}
                  className="px-5 py-2.5 bg-[#ff5a1f] hover:bg-[#e04712] text-white font-medium rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Save size={18} />}
                  <span>{isSubmitting ? 'Guardando...' : (editingId ? 'Guardar Cambios' : 'Guardar Cotización')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
