import { customerRepository, supplierRepository } from '../repositories/masterRepositories';
import React, { useState } from 'react';
import { Building2, LoaderCircle, Search, User, X } from 'lucide-react';
import { clientesService, type Cliente } from '../services/clientesService';
import { proveedoresService, type Proveedor } from '../services/proveedoresService';

type PartyKind = 'cliente' | 'proveedor';

interface QuickPartyCreateModalProps {
  kind: PartyKind;
  initialParty?: Cliente | Proveedor;
  darkMode: boolean;
  onClose: () => void;
  onCreated: (party: Cliente | Proveedor) => void;
}

export const QuickPartyCreateModal: React.FC<QuickPartyCreateModalProps> = ({
  kind,
  initialParty,
  darkMode,
  onClose,
  onCreated
}) => {
  const [tipoPersona, setTipoPersona] = useState<'NATURAL' | 'JURIDICA'>(initialParty?.tipo_persona ?? 'JURIDICA');
  const [documento, setDocumento] = useState(initialParty?.documento ?? '');
  const [nombre, setNombre] = useState(initialParty?.nombre ?? '');
  const [email, setEmail] = useState(initialParty?.email ?? '');
  const [telefono, setTelefono] = useState(initialParty?.telefono ?? '');
  const [direccion, setDireccion] = useState(initialParty?.direccion ?? '');
  const [valorCondicion, setValorCondicion] = useState(String(initialParty ? ('limite_credito' in initialParty ? initialParty.limite_credito : initialParty.condicion_pago) : kind === 'cliente' ? 0 : 30));
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const entityLabel = kind === 'cliente' ? 'cliente' : 'proveedor';
  const accentClass = kind === 'cliente'
    ? 'text-sky-600 focus:ring-sky-500'
    : 'text-teal-600 focus:ring-teal-500';

  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 ${
    darkMode
      ? 'border-slate-700 bg-slate-800 text-white placeholder-slate-500'
      : 'border-gray-300 bg-white text-gray-900'
  } ${accentClass}`;

  const searchDocument = async () => {
    const value = documento.trim();
    const requiredLength = tipoPersona === 'NATURAL' ? 8 : 11;
    if (!/^\d+$/.test(value) || value.length !== requiredLength) {
      setErrorMessage(`${tipoPersona === 'NATURAL' ? 'El DNI' : 'El RUC'} debe tener ${requiredLength} dígitos.`);
      return;
    }

    setIsSearching(true);
    setErrorMessage('');
    try {
      let fullName = '';
      let resultAddress = '';
      if (tipoPersona === 'NATURAL') {
        const result = kind === 'cliente'
          ? await clientesService.consultarDNI(value)
          : await proveedoresService.consultarDNI(value);
        fullName = result.nombre
          || `${result.nombres || ''} ${result.apellido_paterno || ''} ${result.apellido_materno || ''}`.trim();
      } else {
        const result = kind === 'cliente'
          ? await clientesService.consultarRUC(value)
          : await proveedoresService.consultarRUC(value);
        fullName = result.nombre_o_razon_social || '';
        resultAddress = result.direccion || '';
      }

      if (!fullName) {
        setErrorMessage(`No se encontraron datos para este ${tipoPersona === 'NATURAL' ? 'DNI' : 'RUC'}.`);
        return;
      }

      setNombre(fullName);
      if (resultAddress) setDireccion(resultAddress);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `No se pudo consultar el documento del ${entityLabel}.`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    try {
      const commonFields = { tipo_persona: tipoPersona, documento, nombre, email, telefono, direccion };
      const requiredLength = tipoPersona === 'NATURAL' ? 8 : 11;
      if (!new RegExp(`^\\d{${requiredLength}}$`).test(documento) || !nombre.trim()) throw new Error('Revisa el documento y el nombre.');
      const records = kind === 'cliente' ? await customerRepository.list() : await supplierRepository.list();
      const duplicate = records.find(party => party.id !== initialParty?.id && party.documento.trim() === documento.trim());
      if (duplicate) throw new Error(`Posible duplicado: ${duplicate.nombre} ya tiene este documento. Revisa el maestro; no se modificaron registros.`);
      const createdParty = kind === 'cliente'
        ? initialParty
          ? await customerRepository.update(initialParty.id, { ...commonFields, limite_credito: Number(valorCondicion) || 0 })
          : await customerRepository.create({ ...commonFields, limite_credito: Number(valorCondicion) || 0 })
        : initialParty
          ? await supplierRepository.update(initialParty.id, { ...commonFields, condicion_pago: Number(valorCondicion) || 0 })
          : await supplierRepository.create({ ...commonFields, condicion_pago: Number(valorCondicion) || 0 });
      onCreated(createdParty);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `No se pudo guardar el ${entityLabel}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTipoPersonaChange = (value: 'NATURAL' | 'JURIDICA') => {
    setTipoPersona(value);
    setDocumento('');
    setNombre('');
    setErrorMessage('');
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Formulario de ${entityLabel}`} className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className={`my-auto max-h-[90dvh] overflow-y-auto w-full max-w-2xl rounded-2xl border shadow-2xl ${
        darkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-gray-100 bg-white text-slate-900'
      }`}>
        <header className={`flex items-center justify-between border-b px-6 py-4 ${
          darkMode ? 'border-slate-800 bg-slate-800/40' : 'border-gray-100 bg-gray-50'
        }`}>
          <div className="flex items-center gap-3">
            {kind === 'cliente' ? <User size={20} className="text-sky-500" /> : <Building2 size={20} className="text-teal-500" />}
            <h2 className="text-lg font-bold">{initialParty ? 'Editar' : 'Registrar nuevo'} {entityLabel}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Cerrar formulario" className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/50 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-700 dark:hover:text-white">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <p className="mb-2 text-sm font-semibold">Tipo de {entityLabel}</p>
            <div className={`flex max-w-sm rounded-lg p-1 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
              {(['NATURAL', 'JURIDICA'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleTipoPersonaChange(value)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    tipoPersona === value
                      ? darkMode ? 'bg-slate-700 text-white shadow' : 'bg-white text-slate-900 shadow'
                      : 'text-slate-500'
                  }`}
                >
                  {value === 'NATURAL' ? 'Persona natural' : 'Empresa'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">{tipoPersona === 'NATURAL' ? 'DNI *' : 'RUC *'}</label>
              <div className="flex gap-2">
                <input
                  required
                  inputMode="numeric"
                  maxLength={tipoPersona === 'NATURAL' ? 8 : 11}
                  value={documento}
                  onChange={event => setDocumento(event.target.value.replace(/\D/g, ''))}
                  className={inputClass}
                  placeholder={tipoPersona === 'NATURAL' ? '8 dígitos' : '11 dígitos'}
                />
                <button type="button" onClick={searchDocument} disabled={isSearching || isSaving} className={`flex shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60 ${kind === 'cliente' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
                  {isSearching ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
                  Consultar
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">{tipoPersona === 'NATURAL' ? 'Nombres y apellidos *' : 'Razón social *'}</label>
              <input required value={nombre} onChange={event => setNombre(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Correo</label>
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Teléfono</label>
              <input value={telefono} onChange={event => setTelefono(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Dirección</label>
              <input value={direccion} onChange={event => setDireccion(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">{kind === 'cliente' ? 'Límite de crédito (S/)' : 'Condición de pago (días)'}</label>
              <input type="number" min="0" value={valorCondicion} onChange={event => setValorCondicion(event.target.value)} className={inputClass} />
            </div>
          </div>

          {errorMessage && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{errorMessage}</p>}

          <footer className={`flex justify-end gap-3 border-t pt-4 ${darkMode ? 'border-slate-800' : 'border-gray-100'}`}>
            <button type="button" onClick={onClose} disabled={isSaving} className={`rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              Cancelar
            </button>
            <button type="submit" disabled={isSaving || isSearching} className={`rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 ${kind === 'cliente' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
              {isSaving ? 'Guardando...' : `Guardar ${entityLabel}`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
