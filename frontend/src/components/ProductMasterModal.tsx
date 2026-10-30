import { productRepository } from '../repositories/masterRepositories';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { type Producto } from '../services/inventarioService';
import { CatalogValueSelect } from './masters/MasterSelect';

export function ProductMasterModal({ editingProduct, initialDraft, darkMode, onClose, onSaved }: {
  initialDraft?: Partial<Producto>;
  editingProduct: Producto | null; darkMode: boolean; onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialForm = {
    codigo: '',
    descripcion: '',
    categoria: '',
    marca: '',
    unidad: '',
    almacen: '',
    costoUnitario: '',
    precioVenta: '',
    stockMinimo: '5',
    stockInicial: '0'
  };

  const [form, setForm] = useState(() => editingProduct ? {
    ...initialForm, ...editingProduct,
    marca: editingProduct.marca || '',
    costoUnitario: String(editingProduct.costoUnitario), precioVenta: String(editingProduct.precioVenta),
    stockMinimo: String(editingProduct.stockMinimo), stockInicial: String(editingProduct.stock),
  } : { ...initialForm, codigo: initialDraft?.codigo ?? '', descripcion: initialDraft?.descripcion ?? '', almacen: initialDraft?.almacen ?? '', costoUnitario: String(initialDraft?.costoUnitario ?? '') });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.codigo.trim() || !form.descripcion.trim()) {
      alert('Código y descripción son obligatorios.');
      return;
    }

    setSaving(true);
    try {
      const products = await productRepository.list();
      if (products.some(product => product.id !== editingProduct?.id && product.codigo.trim().toUpperCase() === form.codigo.trim().toUpperCase())) {
        throw new Error('Posible código duplicado. Revisa el maestro antes de guardar.');
      }
      if (editingProduct) {
        await productRepository.update(editingProduct.id, {
          codigo: form.codigo.trim().toUpperCase(),
          descripcion: form.descripcion.trim(),
          categoria: form.categoria,
          marca: form.marca,
          unidad: form.unidad,
          almacen: form.almacen,
          costoUnitario: Number(form.costoUnitario) || 0,
          precioVenta: Number(form.precioVenta) || 0,
          stockMinimo: Number(form.stockMinimo) || 0
        });

      } else {
        await productRepository.create({
          codigo: form.codigo.trim().toUpperCase(),
          descripcion: form.descripcion.trim(),
          categoria: form.categoria,
          marca: form.marca,
          unidad: form.unidad,
          almacen: form.almacen,
          costoUnitario: Number(form.costoUnitario) || 0,
          precioVenta: Number(form.precioVenta) || 0,
          stockMinimo: Number(form.stockMinimo) || 0,
          stockInicial: Number(form.stockInicial) || 0
        });

      }
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar el producto.');
    } finally { setSaving(false); }
  };

  return (
          <div role="dialog" aria-modal="true" aria-label="Formulario de producto" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (!saving) onClose(); }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`relative w-full max-w-xl rounded-2xl shadow-2xl max-h-[90dvh] overflow-y-auto ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}
            >
              <div className={`px-6 py-4 flex items-center justify-between border-b ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  {editingProduct ? 'Editar Producto' : 'Registrar Nuevo Producto'}
                </h3>
                <button onClick={() => { if (!saving) onClose(); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                <label className="block text-xs font-semibold">Marca
                  <input value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-700" />
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Código / SKU *</label>
                    <input 
                      required
                      type="text" 
                      placeholder="Ej: LAP-HP450" 
                      value={form.codigo}
                      onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm uppercase ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Categoría</label>
                    <CatalogValueSelect kind="lineas" value={form.categoria} onChange={value => setForm({ ...form, categoria: value })} />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Descripción del Producto *</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Ej: Laptop HP ProBook 450 G8 15.6'' Core i7" 
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Unidad de Medida</label>
                    <CatalogValueSelect kind="unidades" value={form.unidad} onChange={value => setForm({ ...form, unidad: value })} />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Almacén Asignado</label>
                    <CatalogValueSelect kind="almacenes" value={form.almacen} onChange={value => setForm({ ...form, almacen: value })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Costo Unitario (S/)</label>
                    <input 
                      type="number" min="0" 
                      step="0.01"
                      placeholder="0.00" 
                      value={form.costoUnitario}
                      onChange={(e) => setForm({ ...form, costoUnitario: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Precio de Venta (S/)</label>
                    <input 
                      type="number" min="0" 
                      step="0.01"
                      placeholder="0.00" 
                      value={form.precioVenta}
                      onChange={(e) => setForm({ ...form, precioVenta: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Stock Mínimo (Alerta)</label>
                    <input 
                      type="number" min="0" 
                      placeholder="5" 
                      value={form.stockMinimo}
                      onChange={(e) => setForm({ ...form, stockMinimo: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                    />
                  </div>
                  {!editingProduct && (
                    <div>
                      <label className={`block text-xs font-bold uppercase mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Stock Inicial</label>
                      <input 
                        type="number" min="0" 
                        placeholder="0" 
                        value={form.stockInicial}
                        onChange={(e) => setForm({ ...form, stockInicial: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                      />
                    </div>
                  )}
                </div>

                <div className={`pt-4 border-t flex justify-end gap-3 ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                  <button 
                    type="button" 
                    onClick={() => { if (!saving) onClose(); }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600'}`}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" disabled={saving}
                    className="px-5 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Save size={16} />
                    Guardar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
  );
}
