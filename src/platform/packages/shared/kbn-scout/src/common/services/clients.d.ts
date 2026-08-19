import { KbnClient } from '@kbn/kbn-client';
import type { ScoutLogger } from './logger';
import type { ScoutTestConfig, EsClient } from '../../types';
export declare function getEsClient(config: ScoutTestConfig, log: ScoutLogger): EsClient;
export declare function getLinkedEsClient(config: ScoutTestConfig, log: ScoutLogger): EsClient;
export declare function getKbnClient(config: ScoutTestConfig, log: ScoutLogger): KbnClient;
