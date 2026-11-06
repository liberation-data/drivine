import { DatabaseType } from '@/connection/DatabaseType';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { refusedInTransaction, SchemaDdl, SchemaDdlResult, schemaDdlOf } from '@/schema/ddl';
import {
    fullTextIndex,
    itemName,
    neo4jVectorOptions,
    rangeIndex,
    uniquenessConstraint,
    vectorIndex
} from '@/schema/SchemaSpecs';

const translate = (text: string): SchemaDdlResult => SchemaDdl.translate(text);

const create = (spec: any, alias: string | undefined, ifNotExists: boolean, analyzer?: string): SchemaDdlResult => ({
    type: 'CREATE',
    spec,
    ...(alias !== undefined ? { alias } : {}),
    ifNotExists,
    ...(analyzer !== undefined ? { analyzer } : {})
});

function refused(text: string): string {
    const result = translate(text);
    if (result.type !== 'REFUSED') {
        throw new Error(`${text} is not refused: ${JSON.stringify(result)}`);
    }
    return result.message;
}

const NOT_DDL = { type: 'NOT_DDL' };
const AWAIT = { type: 'AWAIT_INDEXES' };

/** SchemaDdl.translate: Neo4j's schema DDL read as Drivine's specs, with no store. `test/cypher/schema.yaml` pins the shapes the three libraries share. */
describe('SchemaDdl', () => {
    it('reads the schema file of an APOC export as the specs the schema API declares', () => {
        expect(
            translate('CREATE FULLTEXT INDEX Chunk_text_fulltext IF NOT EXISTS FOR (n:Chunk) ON EACH [n.`text`];')
        ).toEqual(create(fullTextIndex('Chunk', ['text']), undefined, true));
        expect(translate('CREATE RANGE INDEX IF NOT EXISTS FOR (n:ChatSession) ON (n.lastActivityAt);')).toEqual(
            create(rangeIndex('ChatSession', 'lastActivityAt'), undefined, true)
        );
        expect(
            translate('CREATE RANGE INDEX IF NOT EXISTS FOR (n:ContentElement) ON (n.root_document_id, n.ordinal);')
        ).toEqual(create(rangeIndex('ContentElement', ['root_document_id', 'ordinal']), undefined, true));
        expect(
            translate(
                'CREATE CONSTRAINT Attachment_attachmentId_unique IF NOT EXISTS FOR (node:Attachment) REQUIRE (node.attachmentId) IS UNIQUE;'
            )
        ).toEqual(create(uniquenessConstraint('Attachment', 'attachmentId'), undefined, true));
        expect(
            translate(
                'CREATE CONSTRAINT _DrivineSchema_scope_unique IF NOT EXISTS FOR (node:_DrivineSchema) REQUIRE (node.scope) IS UNIQUE;'
            )
        ).toEqual({ type: 'RESERVED', spec: uniquenessConstraint('_DrivineSchema', 'scope') });
        expect(
            translate(
                'CREATE CONSTRAINT UNIQUE_IMPORT_NAME IF NOT EXISTS FOR (node:`UNIQUE IMPORT LABEL`) REQUIRE (node.`UNIQUE IMPORT ID`) IS UNIQUE;'
            )
        ).toEqual(create(uniquenessConstraint('UNIQUE IMPORT LABEL', 'UNIQUE IMPORT ID'), 'UNIQUE_IMPORT_NAME', true));
        expect(translate('CALL db.awaitIndexes(300);')).toEqual(AWAIT);
        expect(translate('DROP CONSTRAINT UNIQUE_IMPORT_NAME;')).toEqual({
            type: 'DROP',
            kind: 'CONSTRAINT',
            name: 'UNIQUE_IMPORT_NAME',
            ifExists: false
        });
    });

    it("gives an unnamed spec, and the DDL's name as its alias only where the schema API names it otherwise", () => {
        const named = translate('CREATE INDEX person_name FOR (p:Person) ON (p.name)') as any;
        expect(named.spec.name).toBeUndefined();
        expect(named.alias).toEqual('person_name');
        expect(itemName(named.spec)).toEqual('Person_name_range');
        expect((translate('CREATE INDEX Person_name_range FOR (p:Person) ON (p.name)') as any).alias).toBeUndefined();
        expect((translate('CREATE CONSTRAINT FOR (p:Person) REQUIRE p.email IS UNIQUE') as any).alias).toBeUndefined();
    });

    it("reads each form of a range index and a uniqueness constraint, Neo4j 4's among them", () => {
        const range = create(rangeIndex('Person', ['name', 'born']), undefined, false);
        [
            'CREATE INDEX FOR (p:Person) ON (p.name, p.born)',
            'CREATE RANGE INDEX FOR (p:Person) ON (p.name, p.born)',
            'CREATE BTREE INDEX FOR (p:Person) ON (p.name, p.born)',
            'CREATE INDEX ON :Person(name, born)',
            "create index for (p:Person) on (p.name, p.born) options {indexProvider: 'range-1.0'}"
        ].forEach((it) => expect(translate(it)).toEqual(range));
        expect(translate('CREATE INDEX by_name IF NOT EXISTS FOR (p:Person) ON p.name')).toEqual(
            create(rangeIndex('Person', 'name'), 'by_name', true)
        );

        const unique = create(uniquenessConstraint('Person', 'email'), undefined, false);
        [
            'CREATE CONSTRAINT FOR (p:Person) REQUIRE p.email IS UNIQUE',
            'CREATE CONSTRAINT FOR (p:Person) REQUIRE (p.email) IS NODE UNIQUE',
            'CREATE CONSTRAINT ON (p:Person) ASSERT p.email IS UNIQUE'
        ].forEach((it) => expect(translate(it)).toEqual(unique));
        expect(translate('CREATE CONSTRAINT email IF NOT EXISTS ON (p:Person) ASSERT (p.email) IS UNIQUE')).toEqual(
            create(uniquenessConstraint('Person', 'email'), 'email', true)
        );
        expect(translate('CREATE CONSTRAINT FOR (p:Person) REQUIRE (p.first, p.last) IS UNIQUE')).toEqual(
            create(uniquenessConstraint('Person', ['first', 'last']), undefined, false)
        );
    });

    it("reads a full-text index's analyzer, a vector index's options, and a TEXT index as Neo4j's", () => {
        expect(
            translate(
                "CREATE FULLTEXT INDEX titles FOR (n:Book) ON EACH [n.title, n.subtitle] OPTIONS {indexConfig: {`fulltext.analyzer`: 'english', `fulltext.eventually_consistent`: true}}"
            )
        ).toEqual(create(fullTextIndex('Book', ['title', 'subtitle']), 'titles', false, 'english'));
        expect(
            translate(
                "CREATE VECTOR INDEX FOR (c:Chunk) ON (c.embedding) OPTIONS {indexProvider: 'vector-2.0', indexConfig: {`vector.dimensions`: 3, " +
                    "`vector.similarity_function`: 'EUCLIDEAN', `vector.hnsw.m`: 16, `vector.hnsw.ef_construction`: 100, `vector.quantization.enabled`: false}}"
            )
        ).toEqual(
            create(
                vectorIndex('Chunk', 'embedding', 3, 'EUCLIDEAN', {
                    hnswM: 16,
                    hnswEfConstruction: 100,
                    engineOptions: [neo4jVectorOptions({ quantizationEnabled: false })]
                }),
                undefined,
                false
            )
        );
        expect(
            translate(
                "CREATE VECTOR INDEX chunk_embedding IF NOT EXISTS FOR (c:Chunk) ON c.embedding OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}}"
            )
        ).toEqual(create(vectorIndex('Chunk', 'embedding', 1536), 'chunk_embedding', true));
        expect(translate('CREATE TEXT INDEX FOR (p:Person) ON (p.name)')).toEqual(
            create({ kind: 'TEXT', label: 'Person', properties: ['name'] }, undefined, false)
        );
    });

    it('reads a name in backticks with spaces, a doubled backtick in it standing for one', () => {
        const created = translate(
            'CREATE CONSTRAINT `the ``key`` of a thing` FOR (`a node`:`A Thing`) REQUIRE (`a node`.`the key`) IS UNIQUE'
        ) as any;
        expect(created.spec).toEqual(uniquenessConstraint('A Thing', 'the key'));
        expect(created.alias).toEqual('the `key` of a thing');
        expect(translate('drop index `by name` if exists')).toEqual({
            type: 'DROP',
            kind: 'INDEX',
            name: 'by name',
            ifExists: true
        });
        expect(translate('DROP CONSTRAINT `a``b`')).toEqual({
            type: 'DROP',
            kind: 'CONSTRAINT',
            name: 'a`b',
            ifExists: false
        });
        expect(refused('CREATE INDEX `unclosed FOR (p:Person) ON (p.name)')).toMatch(/^Invalid schema command:/);
    });

    it('reads db.awaitIndexes and db.awaitIndex, with arguments or none, as waiting for nothing', () => {
        [
            'CALL db.awaitIndexes',
            'CALL db.awaitIndexes()',
            'CALL db.awaitIndexes(300)',
            "CALL db.awaitIndex('x', 300);",
            'CALL db.awaitIndexes($t)'
        ].forEach((it) => expect(translate(it)).toEqual(AWAIT));
    });

    it('reads Cypher that uses the words as Cypher', () => {
        [
            'CREATE index = (:A)-[:R]->(:B)',
            'CREATE constraint = (:A)',
            'CREATE RANGE = (:A)',
            "CREATE (index:Index {name: 'CREATE INDEX'})",
            'MATCH (index:Index) RETURN index',
            'CALL db.labels()',
            "CALL db.index.fulltext.queryNodes('x', 'y')",
            "RETURN 'DROP INDEX x'",
            'DROP DATABASE x',
            '  // a comment\n MATCH (n) RETURN n',
            ''
        ].forEach((it) => expect(translate(it)).toEqual(NOT_DDL));
    });

    it('refuses by name what a SQL store cannot honour', () => {
        expect(refused('CREATE POINT INDEX FOR (p:Place) ON (p.location)')).toEqual(
            "A POINT index is Neo4j's, and is not made on a SQL store."
        );
        expect(refused('CREATE LOOKUP INDEX FOR (n) ON EACH labels(n)')).toMatch(/^A LOOKUP index/);
        expect(refused('CREATE INDEX FOR ()-[r:KNOWS]-() ON (r.since)')).toEqual(
            "An index on relationships is not made on a SQL store: Drivine's schema is of nodes."
        );
        expect(refused('CREATE CONSTRAINT FOR ()-[r:R]-() REQUIRE r.id IS UNIQUE')).toEqual(
            "A constraint on relationships is not made on a SQL store: Drivine's schema is of nodes."
        );
        expect(refused('CREATE VECTOR INDEX FOR ()-[r:R]-() ON r.e')).toEqual(
            "A vector index on relationships is not made on a SQL store: Drivine's schema is of nodes."
        );
        expect(refused('CREATE INDEX FOR (n:A|B) ON (n.p)')).toEqual(
            'An index over several labels is not made on a SQL store: declare one for each label.'
        );
        expect(refused('CREATE CONSTRAINT FOR (n:A:B) REQUIRE n.p IS UNIQUE')).toEqual(
            'A constraint over several labels is not made on a SQL store: declare one for each label.'
        );
        const existence =
            "A property existence constraint (IS NOT NULL) is not made on a SQL store: Drivine's schema has uniqueness constraints only.";
        expect(refused('CREATE CONSTRAINT FOR (p:P) REQUIRE p.name IS NOT NULL')).toEqual(existence);
        expect(refused('CREATE CONSTRAINT ON (p:P) ASSERT exists(p.name)')).toEqual(existence);
        const key =
            "A key constraint (IS NODE KEY) is not made on a SQL store: Drivine's schema has uniqueness constraints only.";
        expect(refused('CREATE CONSTRAINT FOR (p:P) REQUIRE (p.a, p.b) IS NODE KEY')).toEqual(key);
        expect(refused('CREATE CONSTRAINT FOR (p:P) REQUIRE p.a IS KEY')).toEqual(key);
        expect(refused('CREATE CONSTRAINT FOR (p:P) REQUIRE p.a IS :: STRING')).toMatch(/^A property type constraint/);
        expect(refused('CREATE CONSTRAINT FOR (p:P) REQUIRE p.a IS TYPED STRING')).toMatch(
            /^A property type constraint/
        );
        expect(
            refused('CREATE VECTOR INDEX FOR (c:C) ON (c.a, c.b) OPTIONS {indexConfig: {`vector.dimensions`: 3}}')
        ).toEqual('A vector index is over one property, and this names 2.');
        expect(refused('CREATE VECTOR INDEX FOR (c:C) ON c.e WITH [c.l] OPTIONS {}')).toEqual(
            'A vector index WITH properties to filter by is not made on a SQL store.'
        );
        expect(refused('CREATE VECTOR INDEX FOR (c:C) ON c.e')).toContain('`vector.dimensions`');
        expect(
            refused('CREATE VECTOR INDEX FOR (c:C) ON c.e OPTIONS {indexConfig: {`vector.dimensions`: 0}}')
        ).toContain('positive whole number');
        expect(
            refused(
                "CREATE VECTOR INDEX FOR (c:C) ON c.e OPTIONS {indexConfig: {`vector.dimensions`: 3, `vector.similarity_function`: 'dot'}}"
            )
        ).toEqual("A vector index's `vector.similarity_function` is 'cosine' or 'euclidean', not 'dot'.");
        expect(refused('DROP CONSTRAINT ON (p:P) ASSERT p.a IS UNIQUE')).toMatch(/^DROP CONSTRAINT ON … is Neo4j 4's/);
        expect(refused('DROP INDEX $name')).toContain('parameter');
        expect(refused('CREATE INDEX FOR (m:_DrivineSchema) ON (m.version)')).toMatch(
            /^_DrivineSchema is the label of Drivine's own nodes/
        );
        expect(translate('CREATE CONSTRAINT stamp FOR (s:DrivineStore) REQUIRE s.key IS UNIQUE')).toEqual({
            type: 'RESERVED',
            spec: uniquenessConstraint('DrivineStore', 'key')
        });
    });

    it('refuses a schema command not well formed, saying what was expected', () => {
        expect(refused('CREATE INDEX FOR (p:Person)')).toEqual(
            'Invalid schema command: expected ON, but found the end.'
        );
        expect(refused('CREATE INDEX x TO (p:Person)')).toEqual(
            "Invalid schema command: expected FOR, but found 'TO'."
        );
        expect(refused('CREATE INDEX FOR (p:Person) ON (q.name)')).toEqual(
            'The property q.… is of q, and the pattern binds p.'
        );
        expect(refused('CREATE INDEX FOR (p:Person) ON (p.name); MATCH (n) RETURN n')).toContain('runs on its own');
        expect(refused('CREATE INDEX FOR (p:Person) ON (p.``)')).toContain('empty');
    });

    it('refuses an unterminated name or string as such, reads Unicode names as written, and refuses a parameter where a name or options go', () => {
        const backtick = 'Invalid schema command: A name in backticks has no closing backtick.';
        expect(refused('CREATE INDEX `by name FOR (p:Person) ON (p.name)')).toEqual(backtick);
        expect(refused('CREATE INDEX FOR (p:`Person) ON (p.name)')).toEqual(backtick);
        expect(refused('DROP INDEX `by name')).toEqual(backtick);
        expect(refused("CREATE INDEX FOR (p:Person) ON (p.name) OPTIONS {indexProvider: 'range}")).toEqual(
            'Invalid schema command: A string has no closing quote.'
        );
        // Not DDL by its first words, so the Cypher reader is the one to refuse it.
        expect(translate("CREATE (n:`Person {name: 'x'})")).toEqual(NOT_DDL);
        expect(translate('CREATE `index` = (a)-[:R]->(b)')).toEqual(NOT_DDL);

        expect(translate('CREATE INDEX 名前 FOR (p:Persön) ON (p.naïve)')).toEqual(
            create(rangeIndex('Persön', 'naïve'), '名前', false)
        );
        expect(translate('CREATE INDEX FOR (p:`Ünï cødé 🙂`) ON (p.`🙂`) /* unterminated')).toEqual(
            create(rangeIndex('Ünï cødé 🙂', '🙂'), undefined, false)
        );

        expect(refused('CREATE INDEX $name FOR (p:Person) ON (p.name)')).toContain('parameter');
        expect(refused('CREATE INDEX FOR (p:Person) ON (p.name) OPTIONS $options')).toMatch(
            /^OPTIONS given as a parameter/
        );
        expect(refused('CALL db.awaitIndexes() YIELD x')).toContain('runs on its own');
    });

    it('lets the SQL compilers refuse a schema command, as the translator does or as no query', () => {
        [new PostgresCypherCompiler('g'), new OracleCypherCompiler('g'), new SqliteCypherCompiler('g')].forEach(
            (compiler) => {
                expect(() => compiler.compile('CREATE POINT INDEX FOR (p:Place) ON (p.location)')).toThrow(
                    "A POINT index is Neo4j's, and is not made on a SQL store."
                );
                expect(() => compiler.compile('CREATE INDEX FOR (p:Person) ON (p.name)')).toThrow(
                    /^The statement is a schema command/
                );
                compiler.compile('CREATE (index:Index) RETURN index');
            }
        );
    });

    it('takes Cypher alone on a SQL store for schema DDL, and leaves it to a graph engine', () => {
        const cypher = new QuerySpecification({ text: 'CREATE INDEX FOR (p:Person) ON (p.name)', language: 'CYPHER' });
        expect(schemaDdlOf(DatabaseType.POSTGRES, cypher)?.type).toEqual('CREATE');
        expect(schemaDdlOf(DatabaseType.NEO4J, cypher)).toBeUndefined();
        expect(schemaDdlOf(DatabaseType.MEMGRAPH, cypher)).toBeUndefined();
        expect(schemaDdlOf(DatabaseType.FALKORDB, cypher)).toBeUndefined();
        expect(schemaDdlOf(DatabaseType.POSTGRES, new QuerySpecification('CREATE INDEX x ON t (c)'))).toBeUndefined();
        expect(
            schemaDdlOf(DatabaseType.ORACLE, new QuerySpecification({ text: 'MATCH (n) RETURN n', language: 'CYPHER' }))
        ).toBeUndefined();
    });

    it('refuses a schema command inside a transaction, naming the store as it is written', () => {
        const spec = new QuerySpecification({ text: 'CREATE INDEX FOR (p:Person) ON (p.name)', language: 'CYPHER' });
        (
            [
                [DatabaseType.POSTGRES, 'Postgres'],
                [DatabaseType.ORACLE, 'Oracle'],
                [DatabaseType.SQLITE, 'SQLite']
            ] as const
        ).forEach(([type, engine]) =>
            expect(() => refusedInTransaction(type, spec)).toThrow(`not run inside a transaction on ${engine}:`)
        );
        expect(refusedInTransaction(DatabaseType.NEO4J, spec)).toBe(false);
        const awaits = new QuerySpecification({ text: 'CALL db.awaitIndexes(300)', language: 'CYPHER' });
        expect(refusedInTransaction(DatabaseType.POSTGRES, awaits)).toBe(true);
    });
});
