import { createReturnService } from './service';
import { localReturnRepository } from './localRepository';
import { returnSources } from './sourceRepository';
export const returnService = createReturnService(localReturnRepository, returnSources);
