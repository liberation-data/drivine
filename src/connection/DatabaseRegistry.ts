import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { ConnectionProviderBuilder } from '@/connection/ConnectionProviderBuilder';
import { ConnectionPropertiesFromEnv } from '@/connection/ConnectionProperties';
import { DrivineError } from '@/DrivineError';

export class DatabaseRegistry {
    private static instance: DatabaseRegistry;

    private providers: Map<string, ConnectionProvider>;

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

    defaultProvider(): ConnectionProvider {
        const result = this.providers.values().next().value;
        if (!result) {
            throw new DrivineError(`No connection providers are registered`);
        }
        return result;
    }

    connectionProvider(name?: string): ConnectionProvider | undefined {
        const provider = this.providers.get(name ? name : 'default');
        return provider;
    }

    register(connectionProvider: ConnectionProvider, name?: string): void {
        this.providers.set(name ? name : 'default', connectionProvider);
    }
}
