import type { ScoutPage } from '../fixtures/scope/test';
import type { KibanaUrl } from '../../common/services/kibana_url';
export declare class LoginPage {
    private readonly page;
    private readonly kbnUrl;
    readonly loginBtn: import("playwright-core").Locator;
    readonly roleSelectionInput: import("playwright-core").Locator;
    constructor(page: ScoutPage, kbnUrl: KibanaUrl);
    goto(): Promise<void>;
    loginWithRole(role: string): Promise<void>;
}
