import type { KbnClientRequester } from './kbn_client_requester';
interface UpdateBody {
    name: string;
    description?: string;
    disabledFeatures?: string | string[];
    initials?: string;
    color?: string;
    imageUrl?: string;
}
interface CreateBody extends UpdateBody {
    id: string;
}
export declare class KbnClientSpaces {
    private readonly requester;
    constructor(requester: KbnClientRequester);
    create(body: CreateBody): Promise<void>;
    update(id: string, body: UpdateBody): Promise<void>;
    get(id: string): Promise<unknown>;
    list(): Promise<unknown>;
    delete(id: string): Promise<void>;
}
export {};
