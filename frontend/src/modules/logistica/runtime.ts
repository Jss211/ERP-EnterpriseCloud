import { createLogisticsService } from './service';
import { logisticsRepository } from './localRepository';
import { logisticsSources } from './sourceRepository';
export { logisticsSources };
export const logisticsService=createLogisticsService(logisticsRepository,logisticsSources);
