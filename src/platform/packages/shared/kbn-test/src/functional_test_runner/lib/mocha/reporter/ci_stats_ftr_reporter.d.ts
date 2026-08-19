import type { CiStatsReporter } from '@kbn/ci-stats-reporter';
import type { Config } from '../../config';
import type { Runner } from '../../../fake_mocha_types';
import type { Lifecycle } from '../../lifecycle';
export declare function setupCiStatsFtrTestGroupReporter({ config, lifecycle, runner, reporter, }: {
    config: Config;
    lifecycle: Lifecycle;
    runner: Runner;
    reporter: CiStatsReporter;
}): void;
