interface Options {
    /**
     * Path to the archive to extract, .tar, .tar.gz, and .zip archives are supported
     */
    archivePath: string;
    /**
     * Directory where the contents of the archive will be written. Existing files in that
     * directory will be overwritten. If the directory doesn't exist it will be created.
     */
    targetDir: string;
    /**
     * Number of path segments to strip form paths in the archive, like --strip-components from tar
     */
    stripComponents?: number;
    /**
     * Write modified timestamps to extracted files
     */
    setModifiedTimes?: Date;
}
/**
 * Extract tar and zip archives using a single function, supporting stripComponents
 * for both archive types, only tested with familiar archives we create so might not
 * support some weird exotic zip features we don't use in our own snapshot/build tooling
 */
export declare function extract({ archivePath, targetDir, stripComponents, setModifiedTimes, }: Options): Promise<void>;
export {};
