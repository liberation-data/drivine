import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { ConnectionProviderBuilder } from '@/connection/ConnectionProviderBuilder';
import { ConnectionPropertiesFromEnv } from '@/connection/ConnectionProperties';
import { DrivineError } from '@/DrivineError';

export class ConnectionProviderRegistry {
    private static instance: ConnectionProviderRegistry;

    private providers: Map<string, ConnectionProvider>;

    public static buildOrResolveFromEnv(name?: string): ConnectionProvider {
        return ConnectionProviderRegistry.getBuilder()
            .withProperties(ConnectionPropertiesFromEnv(name))
            .buildOrResolve(name);
    }

    public static getBuilder(): ConnectionProviderBuilder {
        const registry = ConnectionProviderRegistry.getInstance();
        return new ConnectionProviderBuilder(registry);
    }

    public static getInstance(): ConnectionProviderRegistry {
        if (!ConnectionProviderRegistry.instance) {
            ConnectionProviderRegistry.instance = new ConnectionProviderRegistry();
        }
        return ConnectionProviderRegistry.instance;
    }

    private constructor() {
        this.providers = new Map<string, ConnectionProvider>();
    }

    public defaultProvider(): ConnectionProvider {
        const result = this.providers.values().next().value;
        if (!result) {
            throw new DrivineError(`No connection providers are registered`);
        }
        return result;
    }

    public resolve(name?: string): ConnectionProvider | undefined {
        const provider = this.providers.get(name ? name : 'default');
        return provider;
    }

    public register(connectionProvider: ConnectionProvider, name?: string): void {
        this.providers.set(name ? name : 'default', connectionProvider);
    }
}
