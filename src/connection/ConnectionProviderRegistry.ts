import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { ConnectionProviderBuilder } from '@/connection/ConnectionProviderBuilder';
import { ConnectionPropertiesFromEnv } from '@/connection/ConnectionProperties';

export class ConnectionProviderRegistry {
    private static instance: ConnectionProviderRegistry;

    private providers: Map<string, ConnectionProvider>;

    public static buildOrResolveFromEnv(name?: string): ConnectionProvider {
        return ConnectionProviderRegistry.getBuilder()
            .withProperties(ConnectionPropertiesFromEnv(name))
            .buildOrResolve();
    }

    public static getBuilder(): ConnectionProviderBuilder {
        const registry = ConnectionProviderRegistry.getInstance();
        return new ConnectionProviderBuilder(registry);
    }

    private static getInstance(): ConnectionProviderRegistry {
        if (!ConnectionProviderRegistry.instance) {
            ConnectionProviderRegistry.instance = new ConnectionProviderRegistry();
        }
        return ConnectionProviderRegistry.instance;
    }

    private constructor() {
        this.providers = new Map<string, ConnectionProvider>();
    }

    public resolve(name?: string): ConnectionProvider | undefined {
        return this.providers.get(name ? name : 'default');
    }

    public register(connectionProvider: ConnectionProvider, name?: string): void {
        this.providers.set(name ? name : 'default', connectionProvider);
    }
}
