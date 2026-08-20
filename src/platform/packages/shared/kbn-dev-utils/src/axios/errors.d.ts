import type { AxiosError, AxiosResponse } from 'axios';
export interface AxiosRequestError extends AxiosError {
    response: undefined;
}
export interface AxiosResponseError<T> extends AxiosError {
    response: AxiosResponse<T>;
}
export declare const isAxiosRequestError: (error: any) => error is AxiosRequestError;
export declare const isAxiosResponseError: <T = any>(error: any) => error is AxiosResponseError<T>;
