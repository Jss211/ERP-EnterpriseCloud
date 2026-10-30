import { inventarioService, type Producto } from '../services/inventarioService';
import { clientesService, type Cliente, type ClienteFormData } from '../services/clientesService';
import { proveedoresService, type Proveedor, type ProveedorFormData } from '../services/proveedoresService';
import type { EntityRepository } from './contracts';

// Adapters use only the confirmed services. No fallback to simulation/local catalogs.
export const productRepository: EntityRepository<Producto, Parameters<typeof inventarioService.createProducto>[0], Partial<Producto>> = {
  source: 'supabase', list: inventarioService.getProductos,
  create: inventarioService.createProducto, update: inventarioService.updateProducto,
};
export const customerRepository: EntityRepository<Cliente, ClienteFormData> = {
  source: 'supabase', list: clientesService.getClientes,
  create: clientesService.createCliente, update: clientesService.updateCliente,
};
export const supplierRepository: EntityRepository<Proveedor, ProveedorFormData> & { listStrict(): Promise<readonly Proveedor[]> } = {
  source: 'supabase', list: proveedoresService.getProveedores,
  listStrict: () => proveedoresService.getProveedores(true),
  create: proveedoresService.createProveedor, update: proveedoresService.updateProveedor,
};
