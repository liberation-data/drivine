## Multi-Database Support

Register several connections, and inject each by name:

```typescript
DrivineModule.withOptions({
    connectionProviders: [
        DatabaseRegistry.buildOrResolveFromEnv(),            // DATABASE_*
        DatabaseRegistry.buildOrResolveFromEnv('ANALYTICS')  // ANALYTICS_DATABASE_*
    ]
});

@Injectable()
export class AnalyticsRepository {
    constructor(
        @InjectPersistenceManager('ANALYTICS') readonly pm: PersistenceManager,
        @InjectGraphObjectManager('ANALYTICS') readonly gom: StatelessGraphObjectManager
    ) {}
}
```

Without Nest, register each with `DatabaseRegistry.buildOrResolveFromEnv('ANALYTICS')`, and take its managers by name:
`persistenceManagers.get('ANALYTICS')`, `graphObjectManagers.get('ANALYTICS')`.

One `@Transactional()` method can span several databases.
