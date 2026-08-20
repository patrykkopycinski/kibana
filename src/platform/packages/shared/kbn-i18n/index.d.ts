import type { formatList, getIsInitialized, getLocale, getTranslation, init, initDefault, load, translate } from './src/core';
import type { registerTranslationFile, registerTranslationFiles, getTranslationsByLocale, getAllTranslations, getAllTranslationsFromPaths, getRegisteredLocales as getRegisteredLocalesForLoader } from './src/loader';
declare const i18n: {
    getTranslation: typeof getTranslation;
    getLocale: typeof getLocale;
    translate: typeof translate;
    formatList: typeof formatList;
    init: typeof init;
    initDefault: typeof initDefault;
    load: typeof load;
    handleIntlError: import("@formatjs/intl").OnErrorFn;
    getIsInitialized: typeof getIsInitialized;
};
declare const i18nLoader: {
    registerTranslationFile: typeof registerTranslationFile;
    registerTranslationFiles: typeof registerTranslationFiles;
    getTranslationsByLocale: typeof getTranslationsByLocale;
    getAllTranslations: typeof getAllTranslations;
    getAllTranslationsFromPaths: typeof getAllTranslationsFromPaths;
    getRegisteredLocales: typeof getRegisteredLocalesForLoader;
};
export type { Translation, TranslationInput } from './src/translation';
export type { Formats, TranslateArguments } from './src/core';
export { EN_LOCALE } from './src/core';
export { SUPPORTED_LOCALE_IDS, getLocaleLabel, toCanonicalLocaleId, setAvailableLocales, getAvailableLocales, getBrowserPreferredLocale, } from './src/locales';
export type { AvailableLocale, SupportedLocaleId } from './src/locales';
export { i18n, i18nLoader };
