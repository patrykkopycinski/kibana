import type { LayoutAppearance } from '../layout.types';
import type { EmotionFn } from '../types';
declare const root: (appearance?: LayoutAppearance) => EmotionFn;
export declare const styles: {
    root: typeof root;
    content: EmotionFn;
    topBar: EmotionFn;
    bottomBar: EmotionFn;
};
export {};
