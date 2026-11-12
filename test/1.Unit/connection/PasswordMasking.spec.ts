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
import { maskedPassword, maskedProperties } from '@/connection/Masking';

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
        expect(maskedPassword('')).toBeNull();
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
});
