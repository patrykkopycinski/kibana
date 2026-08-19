import type { Lifecycle } from '../lifecycle';
export declare function decorateSnapshotUi({ lifecycle, updateSnapshots, isCi, }: {
    lifecycle: Lifecycle;
    updateSnapshots: boolean;
    isCi: boolean;
}): void;
export declare function expectSnapshot(received: any): {
    toMatch: () => void;
    toMatchInline: (_actual?: any) => void;
};
