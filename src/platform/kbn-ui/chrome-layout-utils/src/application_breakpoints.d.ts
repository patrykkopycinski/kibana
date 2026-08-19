import { type EuiBreakpointSize } from '@elastic/eui';
export declare const useCurrentChromeApplicationBreakpoint: () => EuiBreakpointSize | undefined;
export declare const useIsWithinChromeApplicationBreakpoints: (breakpoints: EuiBreakpointSize[], isResponsive?: boolean) => boolean;
