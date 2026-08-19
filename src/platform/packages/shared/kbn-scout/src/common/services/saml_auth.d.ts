import { SamlSessionManager } from '@kbn/test-saml-auth';
import type { ScoutTestConfig } from '../../types';
import type { ScoutLogger } from './logger';
export declare const createSamlSessionManager: (config: ScoutTestConfig, log: ScoutLogger, customRoleName?: string) => SamlSessionManager;
