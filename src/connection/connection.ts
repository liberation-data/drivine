import { QuerySpecification } from '@/query';
import { CursorSpecification } from '@/cursor';
import { Cursor } from '@/cursor';

export interface Connection {
    sessionId(): string;

    query<T>(spec: QuerySpecification<T>): Promise<any[]>;

    openCursor<T>(cursorSpec: CursorSpecification<T>): Promise<Cursor<T>>;

    startTransaction(): Promise<void>;

    commitTransaction(): Promise<void>;

    rollbackTransaction(): Promise<void>;

    release(err?: Error): Promise<void>;
}
