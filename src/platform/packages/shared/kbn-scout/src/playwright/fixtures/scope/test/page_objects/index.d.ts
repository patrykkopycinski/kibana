export type LoginFunction = (role: string) => Promise<void>;
export type { PageObjects } from '../../../../page_objects';
export { pageObjectsParallelFixture } from './parallel';
export { pageObjectsFixture } from './single_thread';
