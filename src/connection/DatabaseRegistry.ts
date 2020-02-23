import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { ConnectionProviderBuilder } from '@/connection/ConnectionProviderBuilder';
import { ConnectionPropertiesFromEnv } from '@/connection/ConnectionProperties';

export class DatabaseRegistry {
    private static instance: DatabaseRegistry;

    readonly providers: Map<string, ConnectionProvider>;

    static buildOrResolveFromEnv(name?: string): ConnectionProvider {
        return DatabaseRegistry.getBuilder()
            .withProperties(ConnectionPropertiesFromEnv(name))
            .buildOrResolve(name);
    }

    static getBuilder(): ConnectionProviderBuilder {
        const registry = DatabaseRegistry.getInstance();
        return new ConnectionProviderBuilder(registry);
    }

    static getInstance(): DatabaseRegistry {
        if (!DatabaseRegistry.instance) {
            DatabaseRegistry.instance = new DatabaseRegistry();
        }
        return DatabaseRegistry.instance;
    }

    private constructor() {
        this.providers = new Map<string, ConnectionProvider>();
    }

    connectionProvider(name?: string): ConnectionProvider | undefined {
        return name? this.providers.get(name) : this.providers.values().next().value;
    }

    register(connectionProvider: ConnectionProvider): void {
        this.providers.set(connectionProvider.name, connectionProvider);
    }
}
