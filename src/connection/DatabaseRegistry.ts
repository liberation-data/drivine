import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { ConnectionProviderBuilder } from '@/connection/ConnectionProviderBuilder';
import { ConnectionPropertiesFromEnv } from '@/connection/ConnectionProperties';

export class DatabaseRegistry {
    private static instance: DatabaseRegistry | undefined;

    private _providers: Map<string, ConnectionProvider>;

    static buildOrResolveFromEnv(name?: string): ConnectionProvider {
        return DatabaseRegistry.getInstance()
            .builder()
            .withProperties(ConnectionPropertiesFromEnv(name))
            .register(name);
    }

    static getInstance(): DatabaseRegistry {
        if (!DatabaseRegistry.instance) {
            DatabaseRegistry.instance = new DatabaseRegistry();
        }
        return DatabaseRegistry.instance;
    }

    static tearDown(): void {
        delete DatabaseRegistry.instance;
    }

    private constructor() {
        this._providers = new Map<string, ConnectionProvider>();
    }

    get providers(): ConnectionProvider[] {
        return Array.from(this._providers.values());
    }

    builder(): ConnectionProviderBuilder {
        return new ConnectionProviderBuilder(this);
    }

    connectionProvider(name: string = 'default'): ConnectionProvider | undefined {
        if (name === 'default') {
            return this._providers.values().next().value;
        }
        return this._providers.get(name);
    }

    register(connectionProvider: ConnectionProvider): void {
        this._providers.set(connectionProvider.name, connectionProvider);
    }
}
