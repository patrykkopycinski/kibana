import { EsArchiver } from '@kbn/es-archiver';
import type { EsClient } from '../../types';
import type { ScoutLogger } from './logger';
export declare function getEsArchiver(esClient: EsClient, log: ScoutLogger): EsArchiver;
export declare function getLinkedEsArchiver(esClient: EsClient, log: ScoutLogger): EsArchiver;
