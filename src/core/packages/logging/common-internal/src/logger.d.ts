import type { Appender, LogRecord, LoggerFactory, LogMeta, Logger, LogMessageSource, LogLevelId, MetaFilterConfig } from '@kbn/logging';
import type { LogLevel } from '@kbn/logging';
/**
 * @internal
 */
export type CreateLogRecordFn = <Meta extends LogMeta>(level: LogLevel, errorOrMessage: string | Error, meta?: Meta) => LogRecord;
/**
 * A basic, abstract logger implementation that delegates the create of log records to the child's createLogRecord function.
 * @internal
 */
export declare abstract class AbstractLogger implements Logger {
    protected readonly context: string;
    protected readonly level: LogLevel;
    protected readonly appenders: Appender[];
    protected readonly factory: LoggerFactory;
    /**
     * The most permissive log level across the nominal level and all filter levels.
     * Used as an early guard before meta is inspected.
     */
    private readonly gateLevel;
    private readonly compiledFilters;
    constructor(context: string, level: LogLevel, appenders: Appender[], factory: LoggerFactory, filters?: ReadonlyArray<MetaFilterConfig>);
    protected abstract createLogRecord<Meta extends LogMeta>(level: LogLevel, errorOrMessage: string | Error, meta?: Meta): LogRecord;
    /**
     * Filters only loosen the nominal level for more-verbose records. When the
     * requested level is at or below the nominal level, meta can be ignored.
     */
    private resolveEffectiveLevelForRecord;
    private shouldLogRecord;
    trace<Meta extends LogMeta = LogMeta>(message: LogMessageSource, meta?: Meta): void;
    debug<Meta extends LogMeta = LogMeta>(message: LogMessageSource, meta?: Meta): void;
    info<Meta extends LogMeta = LogMeta>(message: LogMessageSource, meta?: Meta): void;
    warn<Meta extends LogMeta = LogMeta>(errorOrMessage: LogMessageSource | Error, meta?: Meta): void;
    error<Meta extends LogMeta = LogMeta>(errorOrMessage: LogMessageSource | Error, meta?: Meta): void;
    fatal<Meta extends LogMeta = LogMeta>(errorOrMessage: LogMessageSource | Error, meta?: Meta): void;
    isLevelEnabled(levelId: LogLevelId): boolean;
    log(record: LogRecord): void;
    get(...childContextPaths: string[]): Logger;
    private appendRecord;
}
