import type { ToolingLog } from '@kbn/tooling-log';
export declare class Progress {
    private total?;
    private complete?;
    private loggingInterval?;
    getTotal(): number | undefined;
    getComplete(): number | undefined;
    getPercent(): number;
    isActive(): boolean;
    activate(log: ToolingLog): void;
    deactivate(): void;
    addToTotal(n: number): void;
    addToComplete(n: number): void;
}
