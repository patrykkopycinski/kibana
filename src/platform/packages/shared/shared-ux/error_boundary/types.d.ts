import type React from 'react';
import type { KibanaErrorService } from './src/services/error_service';
/**
 * Services that are consumed internally in this component.
 * @internal
 */
export interface KibanaErrorBoundaryServices {
    onClickRefresh: () => void;
    errorService: KibanaErrorService;
}
/** @internal */
export interface BaseErrorBoundaryProps {
    services: KibanaErrorBoundaryServices;
}
/** @internal */
export interface BaseErrorBoundaryState {
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
    componentName: string | null;
    isFatal: boolean | null;
}
/**
 * @public
 */
export interface KibanaErrorBoundaryProviderDeps {
    /**
     * Unused. Caught errors are reported to APM RUM only, not EBT.
     * Retained so existing call sites continue to type-check.
     * @deprecated
     */
    analytics?: {
        reportEvent: (eventType: string, eventData: object) => void;
    } | undefined;
}
