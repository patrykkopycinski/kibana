import { type Client as EsClient, type estypes } from '@elastic/elasticsearch';
import type { KbnClient, ScoutLogger } from '../../../../../../common';
export interface Annotation {
    timestamp: number;
    annotation: string;
    job_id: string;
    type: 'annotation' | 'comment';
}
export interface DeleteJobsOptions {
    jobIds: string[];
    deleteUserAnnotations?: boolean;
    deleteAlertingRules?: boolean;
}
export interface MlADJobsApi {
    /** Create an anomaly detection job via the Kibana API (registers in current space) */
    createViaKibana: (jobConfig: Partial<estypes.MlJob>) => Promise<void>;
    /** Delete anomaly detection jobs via the Kibana API */
    delete: (options: DeleteJobsOptions) => Promise<void>;
    /** Get all anomaly detection jobs via the Elasticsearch API */
    getAllJobs: () => Promise<estypes.MlJob[]>;
    /** Wait for an anomaly detection job to exist by polling the Elasticsearch API */
    waitForJobToExist: (jobId: string, timeout?: number) => Promise<void>;
    /** Wait for an anomaly detection job to be deleted by polling the Elasticsearch API */
    waitForJobNotToExist: (jobId: string, timeout?: number) => Promise<void>;
    /** Delete all anomaly detection jobs via the Elasticsearch API */
    deleteAllJobs: () => Promise<void>;
    /** Delete expired ML data via the Elasticsearch API */
    deleteExpiredData: () => Promise<void>;
    calendars: MlCalendarsApi;
    filters: MlFiltersApi;
    annotations: MlAnnotationsApi;
}
export interface MlCalendar {
    calendar_id: string;
    description: string;
    events: estypes.MlCalendarEvent[];
    job_ids: string[];
    total_job_count?: number;
}
export interface MlCalendarsApi {
    /** Create an ML calendar via the Elasticsearch API */
    create: (calendarId: string, config?: {
        job_ids?: string[];
        description?: string;
    }) => Promise<void>;
    /** Add events to an existing ML calendar via the Elasticsearch API */
    createCalendarEvents: (calendarId: string, events: estypes.MlCalendarEvent[]) => Promise<void>;
    /** Wait for specific events to exist in a calendar by polling the Elasticsearch API */
    waitForEventsToExistInCalendar: (calendarId: string, eventsToCheck: estypes.MlCalendarEvent[]) => Promise<void>;
    /** Get all events for an ML calendar via the Elasticsearch API */
    getCalendarEvents: (calendarId: string) => Promise<{
        events: estypes.MlCalendarEvent[];
    }>;
    /** Get an ML calendar by ID via the Kibana API (returns Kibana shape, including events) */
    get: (calendarId: string) => Promise<MlCalendar>;
    /** Get all ML calendars via the Elasticsearch API */
    getAll: () => Promise<estypes.MlGetCalendarsCalendar[]>;
    /** Wait for a calendar to exist by polling the Elasticsearch API */
    waitForCalendarToExist: (calendarId: string) => Promise<void>;
    /** Wait for a calendar to be deleted by polling the Elasticsearch API */
    waitForCalendarNotToExist: (calendarId: string) => Promise<void>;
    /** Delete a calendar via the Elasticsearch API */
    delete: (calendarId: string) => Promise<void>;
    /** Delete all calendars via the Elasticsearch API */
    deleteAll: () => Promise<void>;
}
export interface MlFiltersApi {
    /** Create an ML filter via the Elasticsearch API */
    create: (filter: estypes.MlFilter) => Promise<void>;
    /** Get all ML filters via the Elasticsearch API */
    getAll: () => Promise<estypes.MlFilter[]>;
    /** Get an ML filter by ID via the Elasticsearch API */
    getById: (filterId: string) => Promise<estypes.MlFilter | null>;
    /** Wait for a filter to exist by polling the Elasticsearch API */
    waitForFilterToExist: (filterId: string) => Promise<void>;
    /** Wait for a filter to be deleted by polling the Elasticsearch API */
    waitForFilterToNotExist: (filterId: string) => Promise<void>;
    /** Delete a filter via the Elasticsearch API */
    delete: (filterId: string) => Promise<void>;
    /** Delete all filters via the Elasticsearch API */
    deleteAll: () => Promise<void>;
}
export interface MlAnnotationsApi {
    /** Get all ML annotations via the Elasticsearch API */
    getAll: () => Promise<Array<{
        _id: string;
        _source: Annotation;
    }>>;
    /** Get an ML annotation by ID via the Elasticsearch API */
    getById: (annotationId: string) => Promise<{
        _id: string;
        _source: Annotation;
    } | undefined>;
    /** Wait for an annotation to exist by polling the Elasticsearch API */
    waitForAnnotationToExist: (annotationId: string) => Promise<void>;
    /** Wait for an annotation to be deleted by polling the Elasticsearch API */
    waitForAnnotationNotToExist: (annotationId: string) => Promise<void>;
    /** Delete an annotation via the Kibana API */
    delete: (annotationId: string) => Promise<void>;
    /** Delete all annotations via the Kibana API */
    deleteAll: () => Promise<void>;
}
export interface MlDataFrameAnalyticsApi {
    /** Create a data frame analytics job via the Kibana API (registers in current space) */
    createViaKibana: (jobConfig: {
        id: string;
        [key: string]: unknown;
    }, space?: string) => Promise<void>;
    /** Start a data frame analytics job via the Elasticsearch API */
    start: (analyticsId: string) => Promise<void>;
    /** Get data frame analytics job runtime stats via the Elasticsearch API */
    getStats: (analyticsId: string) => Promise<{
        state: string | undefined;
        hasTrainingDocs: boolean;
    }>;
    /** Wait for a data frame analytics job to stop by polling the Elasticsearch API */
    waitForStopped: (analyticsId: string, timeoutMs?: number) => Promise<void>;
    /** Wait until training has begun so a subsequent waitForStopped does not resolve on the initial stopped state */
    waitForTrainingDocs: (analyticsId: string, timeoutMs?: number) => Promise<void>;
    /**
     * Delete a data frame analytics job if it exists via the Elasticsearch API.
     * Add space-aware saved object cleanup if this is used in space-scoped tests.
     */
    deleteIfExists: (analyticsId: string) => Promise<void>;
    /** Create and run a data frame analytics job via the Kibana and Elasticsearch APIs */
    createAndRun: (jobConfig: {
        id: string;
        [key: string]: unknown;
    }, options?: {
        timeoutMs?: number;
        space?: string;
    }) => Promise<void>;
    /** Get all data frame analytics jobs via the Elasticsearch API */
    getAllJobs: () => Promise<estypes.MlDataframeAnalyticsSummary[]>;
    /** Wait for a data frame analytics job to exist by polling the Elasticsearch API */
    waitForJobToExist: (analyticsId: string, timeout?: number) => Promise<void>;
    /** Wait for a data frame analytics job to be deleted by polling the Elasticsearch API */
    waitForJobNotToExist: (analyticsId: string, timeout?: number) => Promise<void>;
    /** Delete all data frame analytics jobs via the Elasticsearch API */
    deleteAllJobs: () => Promise<void>;
}
export interface MlTrainedModelsApi {
    /** Get all trained models via the Elasticsearch API */
    getAll: () => Promise<estypes.MlTrainedModelConfig[]>;
    /** Delete all trained models (excluding internal models) via the Elasticsearch API */
    deleteAll: () => Promise<void>;
}
export interface MlIngestPipelinesApi {
    /** Delete all ML-related ingest pipelines via the Elasticsearch API */
    deleteAll: () => Promise<void>;
}
export interface MlSavedObjectsApi {
    /** Initialize ML saved objects via the Kibana API */
    init: (simulate?: boolean, space?: string) => Promise<void>;
    /** Sync ML saved objects via the Kibana API */
    sync: (simulate?: boolean, space?: string) => Promise<void>;
}
export interface MlIndicesApi {
    /** Clean up all anomaly detection resources via Kibana and Elasticsearch APIs */
    cleanAnomalyDetection: () => Promise<void>;
    /** Clean up all data frame analytics resources via Kibana and Elasticsearch APIs */
    cleanDataFrameAnalytics: () => Promise<void>;
    /** Clean up all trained models and ingest pipelines via Kibana and Elasticsearch APIs */
    cleanTrainedModels: () => Promise<void>;
    /** Clean up all ML resources via Kibana and Elasticsearch APIs */
    cleanAll: () => Promise<void>;
}
export interface MlApiService {
    anomalyDetection: MlADJobsApi;
    dataFrameAnalytics: MlDataFrameAnalyticsApi;
    trainedModels: MlTrainedModelsApi;
    ingestPipelines: MlIngestPipelinesApi;
    savedObjects: MlSavedObjectsApi;
    indices: MlIndicesApi;
}
export declare const getMlApiHelper: (log: ScoutLogger, kbnClient: KbnClient, esClient: EsClient) => MlApiService;
