export interface Sheet {
    title: string;
    id: string; // UUID as string
    owner_id: string;
    yjs_snapshot?: Buffer; // BYTEA yjs_snapshot
    updated_at: Date;
    created_at: Date;
}