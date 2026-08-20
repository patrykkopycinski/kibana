import type { KbnClient, ScoutLogger } from '../../../../../../common';
import type { CreateDataViewParams, DataView, DataViewApiResponse, DataViewStatusResponse, UpdateDataViewParams } from './types';
export type { CreateDataViewParams, DataView, UpdateDataViewParams } from './types';
/**
 * Data Views API Service
 * Provides methods to interact with Kibana's Data Views API
 */
export interface DataViewsApiService {
    /**
     * Create a new data view
     * @param params - Data view properties (title is required, other fields are optional)
     * @returns Promise with the created data view and status
     */
    create: (params: CreateDataViewParams) => Promise<DataViewApiResponse<DataView>>;
    /**
     * Update an existing data view by ID
     * @param id - The data view ID to update
     * @param params - Fields to update on the data view
     * @returns Promise with the updated data view and status
     */
    update: (id: string, params: UpdateDataViewParams) => Promise<DataViewApiResponse<DataView>>;
    /**
     * Get all data views
     * @returns Promise with array of data views and status
     */
    getAll: (spaceId?: string) => Promise<DataViewApiResponse<DataView[]>>;
    /**
     * Get a single data view by ID
     * @param id - The data view ID
     * @param spaceId - Optional space ID
     * @returns Promise with the data view and status
     */
    get: (id: string, spaceId?: string) => Promise<DataViewApiResponse<DataView>>;
    /**
     * Delete a data view by ID
     * @param id - The data view ID to delete
     * @param spaceId - Optional space ID
     * @returns Promise with status code
     */
    delete: (id: string, spaceId?: string) => Promise<DataViewStatusResponse>;
    /**
     * Find data views that match a predicate function
     * @param predicate - Function to filter data views
     * @param spaceId - Optional space ID
     * @returns Promise with filtered array of data views and status
     */
    find: (predicate: (dataView: DataView) => boolean, spaceId?: string) => Promise<DataViewApiResponse<DataView[]>>;
    /**
     * Delete a data view by its title (convenience method)
     * Finds the first data view matching the title and deletes it
     * @param title - The data view title to search for
     * @param spaceId - Optional space ID
     * @returns Promise with status code
     */
    deleteByTitle: (title: string, spaceId?: string) => Promise<DataViewStatusResponse>;
    /**
     * Get data view ID by title (optionally within a space)
     */
    getIdByTitle: (title: string, spaceId?: string) => Promise<string>;
}
/**
 * Factory function to create a Data Views API service helper
 * @param log - Scout logger instance
 * @param kbnClient - Kibana client for making API requests
 * @returns DataViewsApiService instance
 */
export declare const getDataViewsApiHelper: (log: ScoutLogger, kbnClient: KbnClient) => DataViewsApiService;
