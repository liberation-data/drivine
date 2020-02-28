import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { ConnectionProviderBuilder } from '@/connection/ConnectionProviderBuilder';
import { ConnectionPropertiesFromEnv } from '@/connection/ConnectionProperties';

export class DatabaseRegistry {
    private static instance: DatabaseRegistry;

    readonly providers: Map<string, ConnectionProvider>;

    static buildOrResolveFromEnv(name?: string): ConnectionProvider {
        return DatabaseRegistry.getInstance()
            .builder().withProperties(ConnectionPropertiesFromEnv(name))
            .buildOrResolve(name);
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

    builder(): ConnectionProviderBuilder {
        return new ConnectionProviderBuilder(this);
    }

    connectionProvider(name: string = 'default'): ConnectionProvider | undefined {
        if (name === 'default') {
            return this.providers.values().next().value;
        }
        return this.providers.get(name);
    }

    register(connectionProvider: ConnectionProvider): void {
        this.providers.set(connectionProvider.name, connectionProvider);
    }
}
