import { Transform } from 'stream';
export declare function createFilterRecordsStream(fn: (record: any) => boolean): Transform;
