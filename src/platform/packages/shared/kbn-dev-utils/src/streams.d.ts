import { Transform } from 'stream';
import type File from 'vinyl';
import type { DirectoryFile } from 'vinyl';
interface BufferedFile extends File {
    contents: Buffer;
    isDirectory(): this is DirectoryFile;
}
/**
 * Create a transform stream that processes Vinyl fs streams and
 * calls a function for each file, allowing the function to either
 * mutate the file, replace it with another file (return a new File
 * object), or drop it from the stream (return null)
 */
export declare const transformFileStream: (fn: (file: BufferedFile) => File | void | null | Promise<File | void | null>) => Transform;
export {};
