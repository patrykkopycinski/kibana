import * as Rx from 'rxjs';
export type GetArgsType<T extends LifecyclePhase<any>> = T extends LifecyclePhase<infer X> ? X : never;
export declare class LifecyclePhase<Args extends readonly any[]> {
    private readonly options;
    private readonly handlers;
    triggered: boolean;
    private readonly beforeSubj;
    readonly before$: Rx.Observable<void>;
    private readonly afterSubj;
    readonly after$: Rx.Observable<void>;
    constructor(sub: Rx.Subscription, options?: {
        singular?: boolean;
    });
    add(fn: (...args: Args) => Promise<void> | void): void;
    addSub(sub: Rx.Subscription): void;
    trigger(...args: Args): Promise<void>;
}
