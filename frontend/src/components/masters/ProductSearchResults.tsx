import { Link } from 'react-router-dom';
import type { Producto } from '../../services/inventarioService';
export function ProductSearchResults({ products, onSelect, purchase = false }: { products: Producto[]; onSelect: (product: Producto) => void; purchase?: boolean }) {
  return <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
    {products.length === 0 ? <p className="p-4 text-xs text-slate-500">No hay productos coincidentes. <Link className="text-blue-600 dark:text-blue-300" to="/maestros/productos">Ir a Maestros</Link></p> : products.map(product => <button type="button" key={product.id} onMouseDown={event => event.preventDefault()} onClick={() => onSelect(product)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
      <span><span className="text-xs font-bold text-blue-600 dark:text-blue-300">{product.codigo}</span><span className="ml-2 text-sm font-semibold text-slate-800 dark:text-white">{product.descripcion}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{product.categoria} · Stock: {product.stock} {product.unidad}</span></span>
      <span className="shrink-0 text-xs font-bold text-blue-600 dark:text-blue-300">S/ {(purchase && product.costoUnitario > 0 ? product.costoUnitario : product.precioVenta).toFixed(2)}</span>
    </button>)}
  </div>;
}
