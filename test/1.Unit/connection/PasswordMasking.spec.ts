import { inspect } from 'util';
import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    FalkorDbConnectionProvider,
    Neo4jConnectionProvider,
    OracleConnectionProvider,
    PostgresConnectionProvider
} from '@liberation-data/drivine';
import { maskedPassword, maskedProperties, maskedUrl } from '@/connection/Masking';
import { TransactionMode } from '@/connection/TransactionMode';

const SECRET = 's3cret-p4ss';

/** Every way an application prints an object: none may show the password (#730, port of drivine4j#793). */
function printed(it: object): string[] {
    return [inspect(it), inspect(it, { depth: 10 }), JSON.stringify(it), String(it), `${inspect({ wrapped: it })}`];
}

describe('A password Drivine holds', () => {
    it('prints as ***, and as null where there is none', () => {
        expect(maskedPassword(SECRET)).toBe('***');
        expect(maskedPassword(undefined)).toBeNull();
        expect(maskedPassword(null)).toBeNull();
        // An empty password is a password set, as drivine4j prints it.
        expect(maskedPassword('')).toBe('***');
    });

    it('is masked in properties, which print every other field, and kept for a copy and to connect with', () => {
        const props = maskedProperties({
            databaseType: DatabaseType.NEO4J,
            host: 'h',
            port: 7687,
            userName: 'u',
            password: SECRET
        });
        for (const text of printed(props)) {
            expect(text).not.toContain(SECRET);
        }
        expect(JSON.parse(JSON.stringify(props))).toEqual({
            databaseType: DatabaseType.NEO4J,
            host: 'h',
            port: 7687,
            userName: 'u',
            password: '***'
        });
        expect(JSON.parse(JSON.stringify(maskedProperties({ host: 'h' })))).toEqual({ host: 'h' });
        expect(JSON.parse(JSON.stringify(maskedProperties({ host: 'h', password: undefined })))).toEqual({
            host: 'h',
            password: null
        });
        expect(props.password).toBe(SECRET);
        expect({ ...props }.password).toBe(SECRET);
        expect(Object.keys(props)).toEqual(['databaseType', 'host', 'port', 'userName', 'password']);
    });

    it('is masked in the properties read from the environment', () => {
        const saved = { ...process.env };
        try {
            Object.assign(process.env, {
                MASK_DATABASE_TYPE: 'NEO4J',
                MASK_DATABASE_HOST: 'localhost',
                MASK_DATABASE_USER: 'neo4j',
                MASK_DATABASE_PASSWORD: SECRET
            });
            const props = ConnectionPropertiesFromEnv('MASK');
            expect(props.password).toBe(SECRET);
            for (const text of printed(props)) {
                expect(text).not.toContain(SECRET);
                expect(text).toContain('***');
            }
        } finally {
            process.env = saved;
        }
    });

    it('is not printed by any provider, nor by the builder', async () => {
        const providers = [
            new Neo4jConnectionProvider(
                'n',
                DatabaseType.NEO4J,
                'localhost',
                7687,
                'neo4j',
                SECRET,
                undefined,
                'bolt',
                {}
            ),
            new PostgresConnectionProvider('p', DatabaseType.POSTGRES, {
                host: 'localhost',
                user: 'u',
                password: SECRET,
                database: 'd'
            }),
            new OracleConnectionProvider('o', DatabaseType.ORACLE, {
                user: 'u',
                password: SECRET,
                connectString: 'h:1521/S'
            }),
            new FalkorDbConnectionProvider('f', DatabaseType.FALKORDB, 'g', {
                host: 'localhost',
                port: 6379,
                password: SECRET
            })
        ];
        try {
            for (const provider of providers) {
                for (const text of printed(provider)) {
                    expect(text).not.toContain(SECRET);
                }
                expect(JSON.stringify(provider)).toContain('"password":"***"');
            }
            const builder = DatabaseRegistry.getInstance().builder().withProperties({
                databaseType: DatabaseType.NEO4J,
                host: 'localhost',
                password: SECRET
            });
            for (const text of printed(builder)) {
                expect(text).not.toContain(SECRET);
            }
        } finally {
            await Promise.all(providers.map(async (it) => it.end()));
        }
    });

    it('leaves no setting but the client out of what a provider prints', async () => {
        const neo4j = new Neo4jConnectionProvider('n', DatabaseType.NEO4J, 'h', 7687, 'neo4j', SECRET, 'db', 'bolt', {
            maxConnectionPoolSize: 5
        });
        const postgres = new PostgresConnectionProvider(
            'p',
            DatabaseType.POSTGRES,
            { host: 'h', port: 5432, user: 'u', password: SECRET, database: 'd', max: 5 },
            'g'
        );
        const oracle = new OracleConnectionProvider('o', DatabaseType.ORACLE, {
            user: 'u',
            password: SECRET,
            connectString: 'h:1521/S',
            poolMax: 5,
            connectTimeout: 3,
            graph: 'g'
        });
        const falkor = new FalkorDbConnectionProvider(
            'f',
            DatabaseType.FALKORDB,
            'g',
            { host: 'h', port: 6379, userName: 'u', password: SECRET, connectionTimeout: 9 },
            TransactionMode.STRICT
        );
        try {
            expect(JSON.parse(JSON.stringify(neo4j))).toEqual({
                name: 'n',
                type: DatabaseType.NEO4J,
                host: 'h',
                port: 7687,
                user: 'neo4j',
                password: '***',
                database: 'db',
                protocol: 'bolt',
                config: { maxConnectionPoolSize: 5 }
            });
            expect(JSON.parse(JSON.stringify(postgres))).toEqual({
                name: 'p',
                type: DatabaseType.POSTGRES,
                graphName: 'g',
                host: 'h',
                port: 5432,
                user: 'u',
                password: '***',
                database: 'd',
                max: 5
            });
            expect(JSON.parse(JSON.stringify(oracle))).toEqual({
                name: 'o',
                type: DatabaseType.ORACLE,
                user: 'u',
                password: '***',
                connectString: 'h:1521/S',
                poolMax: 5,
                connectTimeout: 3,
                graph: 'g'
            });
            expect(JSON.parse(JSON.stringify(falkor))).toEqual({
                name: 'f',
                type: DatabaseType.FALKORDB,
                graphName: 'g',
                host: 'h',
                port: 6379,
                userName: 'u',
                password: '***',
                connectionTimeout: 9,
                transactionMode: TransactionMode.STRICT
            });
        } finally {
            await Promise.all([neo4j, postgres, oracle, falkor].map(async (it) => it.end()));
        }
    });

    it('is masked in a Postgres connection string', async () => {
        const provider = new PostgresConnectionProvider('p', DatabaseType.POSTGRES, {
            connectionString: `postgres://u:${SECRET}@h:5432/d?sslmode=disable`
        });
        try {
            for (const text of printed(provider)) {
                expect(text).not.toContain(SECRET);
            }
            expect(JSON.parse(JSON.stringify(provider)).connectionString).toBe(
                'postgres://u:***@h:5432/d?sslmode=disable'
            );
            expect(maskedUrl(`postgres://u@h/d?sslmode=disable&password=${SECRET}`)).toBe(
                'postgres://u@h/d?sslmode=disable&password=***'
            );
            expect(maskedUrl(`postgres://u:p@${SECRET}@h/d`)).toBe('postgres://u:***@h/d');
            expect(maskedUrl('postgres://h:5432/d?application_name=me@x')).toBe(
                'postgres://h:5432/d?application_name=me@x'
            );
        } finally {
            await provider.end();
        }
    });

    it("is masked in Postgres' ssl key, passphrase and pfx, which are secrets too", async () => {
        const provider = new PostgresConnectionProvider('p', DatabaseType.POSTGRES, {
            host: 'h',
            ssl: { rejectUnauthorized: true, cert: 'CERT', key: SECRET, passphrase: SECRET, pfx: Buffer.from(SECRET) }
        });
        try {
            for (const text of printed(provider)) {
                expect(text).not.toContain(SECRET);
            }
            expect(JSON.parse(JSON.stringify(provider)).ssl).toEqual({
                rejectUnauthorized: true,
                cert: 'CERT',
                key: '***',
                passphrase: '***',
                pfx: '***'
            });
            expect(provider.connectionProperties.ssl).toMatchObject({ key: SECRET, passphrase: SECRET });
        } finally {
            await provider.end();
        }
    });
});
