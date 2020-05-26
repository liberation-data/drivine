# Cursors

It is well and good to assemble an application where transactional services are made up from an aggregate of repositories. However, for some use-cases the volume of data is too large to be buffered in a single result set.

Fortunately the PersistenceManager that we saw earlier provides the ability to open a Cursor<T>, which provides two kinds of streaming capabilities.

Let’s explore. In the example below, the repository method promises to return a Cursor for a Route.

```typescript
@Transactional()
async findRoutesBetween(start: string, destination: string): Promise<Cursor<Route>> {
    return this.persistenceManager.openCursor(
        new CursorSpecification<Route>()
            .withStatement(this.routesBetween)
            .bind([start, destination])
            .batchSize(5)
            .transform(Route)
    );
}
```

## Cursors are AsyncIterable

`Cursor<T>` implements AsyncIterable. This means that it can be used with a `for await...of` statement. During the execution of the loop, results will be pullled in batches, until the upstream is depleted.

```typescript
const cursor = await repo.asyncRoutesBetween('Cavite Island', 'NYC');
for await (const item of cursor) {
    // The cursor will read more results, executing
    // database reads, until the stream is consumed.
}
```

## Cursors can pose as a Readable stream

Besides `AsyncIterable` cursors turn themselves into a `Readable` stream. Why would we need this? `AsyncIterable` is helpful, but it may lead to problems when a tight loop is pushing data into a stream, such as a file-stream. Even though data is pulled in batches, pushing to quickly into a stream will cause problems. The following example could potentially crash:

```typescript
const cursor = await repo.asyncRoutesBetween('Cavite Island', 'NYC');
for await (const item of cursor) {
    const result = fs.write(item);
}
```

Pushing data too quickly can overload buffers - this is signified when fs.write(item) returns false. If you ignore this warning and continue, your application can crash. The solution is as follows:

```typescript
cursor.asStream().pipe(fileStream);
await StreamUtils.untilClosed(fileStream);
```

Now new information will be pulled from the cursor as needed. It is the sink stream (filestream) that will coordinate this, and at the rate at which it can handle.
