import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineLogger } from '@/logger';

/** Where a datasource reaches the store a container runs, and whatever else the container fixes. */
export interface ContainerConnection {
    host: string;
    port: number;
    userName?: string;
    password?: string;
    databaseName?: string;
}

/** A store's container: how to make it, and what a datasource uses to reach it once it is started. */
export interface TestContainerSpec {
    image: string;
    port: number;
    container(image: string, datasource: Environment): GenericContainer;
    connection(started: StartedTestContainer, datasource: Environment): ContainerConnection;
}

/** The settings of one datasource, as `DATABASE_*` names them, without the datasource's prefix. */
export type Environment = Record<string, string | undefined>;

/** The user every container that takes one is made with. */
export const TEST_CONTAINER_USER = 'drivine';
/** At least eight characters, which Neo4j wants. */
export const TEST_CONTAINER_PASSWORD = 'drivine-test';

const NEO4J: TestContainerSpec = {
    image: 'neo4j:latest',
    port: 7687,
    container: (image) =>
        new GenericContainer(image)
            .withEnvironment({ NEO4J_AUTH: `neo4j/${TEST_CONTAINER_PASSWORD}` })
            .withExposedPorts(7687)
            .withWaitStrategy(Wait.forLogMessage(/Started\./))
            .withStartupTimeout(120_000),
    connection: (started) => ({
        host: started.getHost(),
        port: started.getMappedPort(7687),
        userName: 'neo4j',
        password: TEST_CONTAINER_PASSWORD
    })
};

const MEMGRAPH: TestContainerSpec = {
    image: 'memgraph/memgraph:latest',
    port: 7687,
    // Memgraph logs that it is running before Bolt takes connections: wait on the port instead.
    container: (image) => new GenericContainer(image).withExposedPorts(7687).withWaitStrategy(Wait.forListeningPorts()),
    connection: (started) => ({ host: started.getHost(), port: started.getMappedPort(7687) })
};

const FALKORDB: TestContainerSpec = {
    image: 'falkordb/falkordb:latest',
    port: 6379,
    container: (image) => new GenericContainer(image).withExposedPorts(6379).withWaitStrategy(Wait.forListeningPorts()),
    connection: (started) => ({ host: started.getHost(), port: started.getMappedPort(6379) })
};

const POSTGRES: TestContainerSpec = {
    // pgvector's image: Postgres with the extension a vector search uses, which the object manager makes where it can.
    image: 'pgvector/pgvector:pg16',
    port: 5432,
    container: (image, datasource) =>
        new GenericContainer(image)
            .withEnvironment({
                POSTGRES_USER: TEST_CONTAINER_USER,
                POSTGRES_PASSWORD: TEST_CONTAINER_PASSWORD,
                POSTGRES_DB: datasource.DATABASE_NAME ?? 'drivine'
            })
            .withExposedPorts(5432)
            // The server is ready once, for the init scripts, before it restarts and is ready for good.
            .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2)),
    connection: (started, datasource) => ({
        host: started.getHost(),
        port: started.getMappedPort(5432),
        userName: TEST_CONTAINER_USER,
        password: TEST_CONTAINER_PASSWORD,
        databaseName: datasource.DATABASE_NAME ?? 'drivine'
    })
};

const ORACLE: TestContainerSpec = {
    image: 'gvenzl/oracle-free:23-faststart',
    port: 1521,
    // The listener is up before the pluggable database is open and the user made in it.
    container: (image) =>
        new GenericContainer(image)
            .withEnvironment({
                ORACLE_PASSWORD: TEST_CONTAINER_PASSWORD,
                APP_USER: TEST_CONTAINER_USER,
                APP_USER_PASSWORD: TEST_CONTAINER_PASSWORD
            })
            .withExposedPorts(1521)
            .withWaitStrategy(Wait.forLogMessage(/DATABASE IS READY TO USE!/))
            .withStartupTimeout(300_000),
    // An ordinary user of the pluggable database: the administrators' tablespace can't hold a graph's JSON column.
    connection: (started) => ({
        host: started.getHost(),
        port: started.getMappedPort(1521),
        userName: TEST_CONTAINER_USER,
        password: TEST_CONTAINER_PASSWORD,
        databaseName: 'FREEPDB1'
    })
};

/** The containers Drivine can start, by the type of the datasource that wants one. */
export const TEST_CONTAINER_SPECS: Partial<Record<DatabaseType, TestContainerSpec>> = {
    [DatabaseType.NEO4J]: NEO4J,
    [DatabaseType.MEMGRAPH]: MEMGRAPH,
    [DatabaseType.FALKORDB]: FALKORDB,
    [DatabaseType.POSTGRES]: POSTGRES,
    [DatabaseType.ORACLE]: ORACLE
};

const TYPE_KEY = /^(?:(.+)_)?DATABASE_TYPE$/;

/**
 * Test containers for the datasources configured in the environment, or a local instance in a container's place.
 * drivine4j's `DrivineTestConfiguration`.
 *
 * For each datasource (`DATABASE_TYPE`, or `<NAME>_DATABASE_TYPE` for a named one) of a type that has a container,
 * a container is started and the datasource's host and port, and whatever else the container fixes, are rewritten to
 * reach it. Datasources of one type share one container.
 *
 * `USE_LOCAL_<TYPE>=true` (`USE_LOCAL_NEO4J`, `USE_LOCAL_MEMGRAPH`, `USE_LOCAL_FALKORDB`, `USE_LOCAL_POSTGRES`,
 * `USE_LOCAL_ORACLE`) starts no container for that type and leaves its datasources as they are, to work against an
 * instance of your own. `<TYPE>_TEST_IMAGE` picks another image.
 *
 * Neo4j, Memgraph and FalkorDB run their `latest` images, as drivine4j's containers do, so a new engine release reaches
 * your tests as soon as it is out. Pin one with `<TYPE>_TEST_IMAGE` to hold it back.
 */
export class DrivineTestContainers {
    private static readonly logger = new DrivineLogger(DrivineTestContainers.name);

    /** Whether the type's datasources use a local instance, with `USE_LOCAL_<TYPE>=true`, in place of a container. */
    static useLocal(type: DatabaseType, env: Environment = process.env): boolean {
        return env[`USE_LOCAL_${type}`]?.toLowerCase() === 'true';
    }

    /**
     * The image the type's container runs: `<TYPE>_TEST_IMAGE`, or the type's default where that is unset or blank, as
     * in drivine-python, so a blanked override doesn't start an image named ''. Undefined for no container.
     */
    static image(type: DatabaseType, env: Environment = process.env): string | undefined {
        const spec = TEST_CONTAINER_SPECS[type];
        return spec && (env[`${type}_TEST_IMAGE`] || spec.image);
    }

    /** The prefix of each datasource configured in the environment, '' for the default one, with its type. */
    static datasources(env: Environment = process.env): { prefix: string; type: DatabaseType }[] {
        return (
            Object.keys(env)
                .map((key) => TYPE_KEY.exec(key))
                // A blank type is no datasource: a setting cleared so dotenv can't fill it again.
                .filter((match): match is RegExpExecArray => match != null && !!env[match[0]])
                .map((match) => ({ prefix: match[1] ? `${match[1]}_` : '', type: env[match[0]] as DatabaseType }))
        );
    }

    /**
     * Starts a container for each type of datasource in the environment that has one and isn't local, and rewrites
     * those datasources to reach it.
     */
    static async start(env: Environment = process.env): Promise<DrivineTestContainers> {
        const byType = new Map<DatabaseType, string[]>();
        for (const { prefix, type } of DrivineTestContainers.datasources(env)) {
            byType.set(type, [...(byType.get(type) ?? []), prefix]);
        }
        const started = new Map<DatabaseType, StartedTestContainer>();
        try {
            await Promise.all(
                [...byType].map(async ([type, prefixes]) => {
                    const container = await DrivineTestContainers.startFor(type, prefixes, env);
                    if (container) {
                        started.set(type, container);
                    }
                })
            );
        } catch (e) {
            await Promise.all([...started.values()].map(async (it) => it.stop()));
            throw e;
        }
        return new DrivineTestContainers(started);
    }

    private static async startFor(
        type: DatabaseType,
        prefixes: string[],
        env: Environment
    ): Promise<StartedTestContainer | undefined> {
        const spec = TEST_CONTAINER_SPECS[type];
        const names = prefixes.map((it) => (it === '' ? 'default' : it.slice(0, -1))).join(', ');
        if (!spec) {
            DrivineTestContainers.logger.log(
                `${type} (${names}): no test container, so its settings are used as they are`
            );
            return undefined;
        }
        if (DrivineTestContainers.useLocal(type, env)) {
            DrivineTestContainers.logger.log(`${type} (${names}): USE_LOCAL_${type}=true, so a local instance is used`);
            return undefined;
        }
        const image = DrivineTestContainers.image(type, env) ?? spec.image;
        const first = DrivineTestContainers.settingsOf(prefixes[0], env);
        DrivineTestContainers.logger.log(`${type} (${names}): starting ${image}`);
        const started = await spec.container(image, first).start();
        for (const prefix of prefixes) {
            DrivineTestContainers.rewrite(prefix, spec.connection(started, first), env);
        }
        return started;
    }

    private static settingsOf(prefix: string, env: Environment): Environment {
        return Object.fromEntries(
            Object.keys(env)
                .filter((key) => key.startsWith(`${prefix}DATABASE_`))
                .map((key) => [key.slice(prefix.length), env[key]])
        );
    }

    private static rewrite(prefix: string, connection: ContainerConnection, env: Environment): void {
        const settings: [string, string | number | undefined][] = [
            ['HOST', connection.host],
            ['PORT', connection.port],
            ['USER', connection.userName],
            ['PASSWORD', connection.password],
            ['NAME', connection.databaseName]
        ];
        for (const [setting, value] of settings) {
            if (value !== undefined) {
                env[`${prefix}DATABASE_${setting}`] = String(value);
            }
        }
    }

    private constructor(readonly started: Map<DatabaseType, StartedTestContainer>) {}

    /** Stops every container this started. */
    async stop(): Promise<void> {
        await Promise.all([...this.started.values()].map(async (it) => it.stop()));
        this.started.clear();
    }
}
