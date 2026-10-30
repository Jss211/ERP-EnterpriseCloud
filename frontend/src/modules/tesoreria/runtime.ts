import { createTreasuryService } from './service';
import { treasuryRepository } from './localRepository';
import { treasurySources } from './sources';
export const treasuryService=createTreasuryService(treasuryRepository,treasurySources);
