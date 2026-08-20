import type { ScoutPage } from '../../fixtures/scope/test';
/**
 * Creates a lazily instantiated proxy for a Page Object class, deferring the creation of the instance until
 * a property or method is accessed. It helps avoiding instantiation of page objects that may not be used
 * in certain test scenarios.
 *
 * @param PageObjectClass - The page object class to be instantiated lazily.
 * @param scoutPage - ScoutPage instance, that extends the Playwright `page` fixture and passed to the page object class constructor.
 * @param constructorArgs - Additional arguments to be passed to the page object class constructor.
 * @returns A proxy object that behaves like an instance of the page object class, instantiating it on demand.
 */
export declare function createLazyPageObject<T extends object, Args extends any[]>(PageObjectClass: new (page: ScoutPage, ...args: Args) => T, scoutPage: ScoutPage, ...constructorArgs: Args): T;
