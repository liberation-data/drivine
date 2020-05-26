export interface CursorStreamOptions<T> {
    transform?: (next: T) => any;
}
