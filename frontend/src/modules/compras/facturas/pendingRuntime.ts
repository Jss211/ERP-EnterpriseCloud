import { createPendingInvoiceService } from './pendingService';
import { localInvoiceRepository } from './localRepository';
export const pendingInvoiceService = createPendingInvoiceService(localInvoiceRepository);
