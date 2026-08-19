import type { VECTORDB_APP_ID } from './constants';
export type VectordbApp = typeof VECTORDB_APP_ID;
export type VectordbLinkId = 'getting_started';
export type DeepLinkId = VectordbApp | `${VectordbApp}:${VectordbLinkId}`;
