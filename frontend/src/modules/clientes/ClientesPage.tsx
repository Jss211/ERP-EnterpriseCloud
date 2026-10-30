import { DuplicateNotice } from '../../components/masters/DuplicateNotice';
import { QuickPartyCreateModal } from '../../components/QuickPartyCreateModal';
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, X, Building, Phone, Mail, User, History, Calendar, Activity } from 'lucide-react';
import { clientesService } from '../../services/clientesService';
import type { Cliente } from '../../services/clientesService';

export const ClientesPage: React.FC = () => {
  const { darkMode } = useOutletContext<{ darkMode: boolean }>();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para el Formulario Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Estados para el Modal de Historial
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  
  useEffect(() => {
    clientesService.getClientes().then(data => setClientes(data));
  }, []);

  const handleEdit = (cliente: Cliente) => {
    setEditingId(cliente.id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (window.confirm(`¿Estás seguro que deseas eliminar permanentemente a "${nombre}"?`)) {
      try {
        await clientesService.deleteCliente(id);
        setClientes(prev => prev.filter(c => c.id !== id));
      } catch (error) {
        alert("Ocurrió un error al intentar eliminar el cliente.");
      }
    }
  };

  const openHistory = (cliente: Cliente) => {
    setSelectedClient(cliente);
    setIsHistoryModalOpen(true);
  };

  const clientesFiltrados = clientes.filter(c => 
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.documento.includes(searchTerm)
  );

  return (
    <div className="space-y-6 relative">
      <DuplicateNotice records={clientes.map(record => ({ id: record.id, key: record.documento }))} />
      <div className={`flex justify-between items-center p-5 rounded-xl shadow-sm border transition-colors ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
      }`}>
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>Gestión de Clientes</h1>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Administra datos, contactos, historial y créditos de tus clientes.</p>
        </div>
        <button 
          onClick={() => { setEditingId(null); setIsModalOpen(true); }}
          className="bg-[#ff5a1f] hover:bg-[#e04712] text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm shadow-orange-200"
        >
          <Plus size={18} />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      <div className={`p-4 rounded-xl shadow-sm border flex gap-4 transition-colors ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
      }`}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, RUC o DNI..." 
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
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Tipo</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Documento</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Cliente</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Contacto</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Crédito Asignado</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Estado</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-right ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Acciones</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-gray-100'}`}>
              {clientesFiltrados.map((cliente) => (
                <tr key={cliente.id} className={`transition-colors ${
                  darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-orange-50/30'
                }`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {cliente.tipo_persona === 'NATURAL' ? (
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md w-fit ${
                        darkMode ? 'text-blue-400 bg-blue-950/60 border border-blue-800/50' : 'text-blue-600 bg-blue-50'
                      }`}>
                        <User size={14} /> Natural
                      </span>
                    ) : (
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md w-fit ${
                        darkMode ? 'text-indigo-400 bg-indigo-950/60 border border-indigo-800/50' : 'text-indigo-600 bg-indigo-50'
                      }`}>
                        <Building size={14} /> Empresa
                      </span>
                    )}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{cliente.documento}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{cliente.nombre}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    <div className="flex items-center gap-1.5"><Mail size={12} /> {cliente.email}</div>
                    <div className="flex items-center gap-1.5 mt-1"><Phone size={12} /> {cliente.telefono}</div>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    S/ {Number(cliente.limite_credito || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        cliente.estado === 'Activo' 
                          ? (darkMode ? 'bg-green-950/60 text-green-400 border border-green-800/50' : 'bg-green-100 text-green-700')
                          : cliente.estado === 'Inactivo' || cliente.estado?.includes('Suspendido')
                          ? (darkMode ? 'bg-red-950/60 text-red-400 border border-red-800/50' : 'bg-red-100 text-red-700')
                          : (darkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700')
                      }`}>
                        {cliente.estado || 'Activo'}
                      </span>
                      {(cliente.dias_inactivo ?? 0) > 0 && (
                        <span className="text-[10px] text-red-400 font-bold flex items-center gap-1">
                          <Activity size={10} /> {cliente.dias_inactivo} días inactivo
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => openHistory(cliente)}
                      className={`mx-1 p-1.5 rounded-md transition-colors ${
                        darkMode ? 'text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20' : 'text-amber-500 hover:text-amber-700 bg-amber-50'
                      }`} 
                      title="Ver Historial"
                    >
                      <History size={16} />
                    </button>
                    <button 
                      onClick={() => handleEdit(cliente)}
                      className={`mx-1 p-1.5 rounded-md transition-colors ${
                        darkMode ? 'text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20' : 'text-blue-500 hover:text-blue-700 bg-blue-50'
                      }`} 
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(cliente.id, cliente.nombre)}
                      className={`mx-1 p-1.5 rounded-md transition-colors ${
                        darkMode ? 'text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20' : 'text-red-500 hover:text-red-700 bg-red-50'
                      }`} 
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className={`px-6 py-8 text-center ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    No se encontraron clientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isHistoryModalOpen && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm transition-opacity">
          <div className={`rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-100'
          }`}>
            <div className={`px-6 py-4 border-b flex justify-between items-center ${
              darkMode ? 'bg-slate-800/50 border-slate-800' : 'bg-gray-50/50 border-gray-100'
            }`}>
              <h2 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                <History size={20} className="text-amber-500" />
                Historial del Cliente
              </h2>
              <button onClick={() => setIsHistoryModalOpen(false)} className={`transition-colors p-1 ${
                darkMode ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-500'
              }`}>
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <div className={`mb-6 pb-4 border-b ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                <h3 className={`font-bold text-xl ${darkMode ? 'text-white' : 'text-gray-900'}`}>{selectedClient.nombre}</h3>
                <p className={`text-sm flex items-center gap-2 mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  <User size={15} className="text-gray-400" /> {selectedClient.documento}
                </p>
              </div>
              
              <div className="max-h-[50vh] overflow-y-auto custom-scrollbar pr-4">
                {selectedClient.historial && selectedClient.historial.length > 0 ? (
                  <div className={`relative border-l-2 ml-3 space-y-8 py-2 ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                    {selectedClient.historial.map((entry) => (
                      <div key={entry.id} className="relative pl-6">
                        <div className={`absolute -left-[7px] top-1 w-3 h-3 bg-[#ff5a1f] rounded-full ring-4 ${
                          darkMode ? 'ring-slate-900' : 'ring-white'
                        } shadow-sm`}></div>
                        <div className="flex flex-col">
                          <div className={`flex items-center gap-2 text-xs font-bold mb-1.5 uppercase tracking-wide ${
                            darkMode ? 'text-slate-400' : 'text-gray-400'
                          }`}>
                            <Calendar size={13} className="text-gray-400" />
                            {new Date(entry.fecha).toLocaleDateString('es-PE', {
                              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </div>
                          <div className={`rounded-lg p-3 border shadow-sm ${
                            darkMode ? 'bg-slate-800/80 border-slate-700 text-slate-200' : 'bg-gray-50 border-gray-100 text-gray-800'
                          }`}>
                            <h4 className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{entry.accion}</h4>
                            <p className={`text-sm mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>{entry.detalle}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`flex flex-col items-center justify-center py-8 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                    <History size={32} className="mb-3 opacity-20" />
                    <p className="text-sm">No hay historial registrado.</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className={`px-6 py-4 border-t flex justify-end ${
              darkMode ? 'bg-slate-800/50 border-slate-800' : 'bg-gray-50 border-gray-100'
            }`}>
               <button onClick={() => setIsHistoryModalOpen(false)} className={`px-5 py-2 border font-medium rounded-lg transition-colors ${
                 darkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
               }`}>
                  Cerrar
                </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && <QuickPartyCreateModal
        key={editingId ?? 'new'} kind="cliente" darkMode={darkMode}
        initialParty={clientes.find(item => item.id === editingId)}
        onClose={() => { setIsModalOpen(false); setEditingId(null); }}
        onCreated={party => {
          const saved = party as Cliente;
          setClientes(prev => prev.some(item => item.id === saved.id) ? prev.map(item => item.id === saved.id ? saved : item) : [...prev, saved]);
        }}
      />}
    </div>
  );
};
