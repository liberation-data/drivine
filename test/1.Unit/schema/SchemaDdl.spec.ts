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

    it('reads IF NOT EXISTS and IF EXISTS, and refuses IF without EXISTS', () => {
        expect(translate('CREATE CONSTRAINT IF NOT EXISTS FOR (p:P) REQUIRE p.a IS UNIQUE')).toEqual(
            create(uniquenessConstraint('P', 'a'), undefined, true)
        );
        expect(refused('CREATE INDEX IF NOT FOR (p:P) ON (p.a)')).toEqual(
            "Invalid schema command: expected EXISTS, but found 'FOR'."
        );
        expect(refused('CREATE INDEX by_a IF EXISTS FOR (p:P) ON (p.a)')).toEqual(
            "Invalid schema command: expected NOT, but found 'EXISTS'."
        );
        expect(refused('DROP INDEX by_a IF')).toEqual('Invalid schema command: expected EXISTS, but found the end.');
        expect(refused('DROP INDEX by_a IF NOT EXISTS')).toEqual(
            "Invalid schema command: expected EXISTS, but found 'NOT'."
        );
    });

    it('reads labels and properties in backticks, a doubled backtick standing for one, and refuses an empty name', () => {
        expect(translate('CREATE INDEX FOR (`n``m`:`a``b`) ON (`n``m`.`c``d`)')).toEqual(
            create(rangeIndex('a`b', 'c`d'), undefined, false)
        );
        expect(translate('CREATE INDEX FOR (:`a``b`) ON (x.c)')).toEqual(
            create(rangeIndex('a`b', 'c'), undefined, false)
        );
        expect(refused('CREATE INDEX `` FOR (p:P) ON (p.a)')).toEqual(
            "A schema item's name is empty: an item is created with a name, or with none."
        );
        expect(refused('CREATE INDEX `  ` FOR (p:P) ON (p.a)')).toMatch(/^A schema item's name is empty/);
        expect(refused('CREATE INDEX FOR (p:``) ON (p.a)')).toEqual('A label is empty: an empty name names nothing.');
        expect(refused('DROP CONSTRAINT ``')).toEqual('A name is empty: an empty name names nothing.');
        expect(refused('DROP INDEX $`the name`')).toContain('$the name');
    });

    it('refuses an index or constraint on relationships or of no label, whatever the pattern', () => {
        const index = "An index on relationships is not made on a SQL store: Drivine's schema is of nodes.";
        expect(refused('CREATE INDEX FOR (n:L)-[:R]-() ON (n.a)')).toEqual(index);
        expect(refused('CREATE INDEX FOR ()<-[r:R]-() ON (r.a)')).toEqual(index);
        const constraint = "A constraint on relationships is not made on a SQL store: Drivine's schema is of nodes.";
        expect(refused('CREATE CONSTRAINT FOR (n:L) REQUIRE n.a IS RELATIONSHIP UNIQUE')).toEqual(constraint);
        expect(refused('CREATE CONSTRAINT FOR (n:L) REQUIRE n.a IS REL UNIQUE')).toEqual(constraint);
        expect(refused('CREATE INDEX FOR (n) ON (n.a)')).toEqual(
            'An index is made for the nodes of one label, and this pattern names none.'
        );
        expect(refused('CREATE CONSTRAINT FOR (n:A&B) REQUIRE n.a IS UNIQUE')).toMatch(/over several labels/);
    });

    it('refuses each constraint but [NODE] UNIQUE, by name or as not well formed', () => {
        expect(refused('CREATE CONSTRAINT FOR (n:L) REQUIRE n.a IS NODE KEY')).toMatch(
            /^A key constraint \(IS NODE KEY\)/
        );
        expect(refused('CREATE CONSTRAINT FOR (n:L) REQUIRE (n.a) IS NOT NULL')).toMatch(/^A property existence/);
        expect(refused('CREATE CONSTRAINT FOR (n:L) REQUIRE n.a IS NODE EXISTS')).toEqual(
            "Invalid schema command: expected UNIQUE, but found 'EXISTS'."
        );
        expect(refused('CREATE CONSTRAINT FOR (n:L) REQUIRE n.a UNIQUE')).toEqual(
            "Invalid schema command: expected IS, but found 'UNIQUE'."
        );
        expect(refused('CREATE CONSTRAINT FOR (n:L) ASSERT n.a IS UNIQUE')).toEqual(
            "Invalid schema command: expected REQUIRE, but found 'ASSERT'."
        );
        expect(refused('CREATE CONSTRAINT ON (n:L) REQUIRE n.a IS UNIQUE')).toEqual(
            "Invalid schema command: expected ASSERT, but found 'REQUIRE'."
        );
        expect(refused('CREATE CONSTRAINT FOR (n:L) REQUIRE (n.a, m.b) IS UNIQUE')).toEqual(
            'The property m.… is of m, and the pattern binds n.'
        );
    });

    it("reads Neo4j 4's ON :Label(prop) for range and TEXT indexes only", () => {
        expect(translate('CREATE TEXT INDEX ON :P(name)')).toEqual(
            create({ kind: 'TEXT', label: 'P', properties: ['name'] }, undefined, false)
        );
        expect(translate('CREATE TEXT INDEX P_name_text FOR (p:P) ON (p.name)')).toEqual(
            create({ kind: 'TEXT', label: 'P', properties: ['name'] }, undefined, false)
        );
        expect(refused('CREATE TEXT INDEX FOR (p:P) ON (p.a, p.b)')).toEqual(
            'A TEXT index is over one property, and this names 2.'
        );
        expect(refused('CREATE FULLTEXT INDEX ON :P(name)')).toEqual(
            "Invalid schema command: expected FOR, but found 'ON'."
        );
        expect(refused('CREATE VECTOR INDEX ON :P(e)')).toEqual(
            "Invalid schema command: expected FOR, but found 'ON'."
        );
        expect(refused('CREATE INDEX ON :P(p.name)')).toEqual("Invalid schema command: expected ')', but found '.'.");
        expect(refused('CREATE FULLTEXT INDEX FOR (p:P) ON (p.a)')).toEqual(
            "Invalid schema command: expected EACH, but found '('."
        );
    });

    it("refuses schema for the labels of Drivine's own nodes but their own uniqueness constraints", () => {
        const own = /^DrivineStore is the label of Drivine's own nodes/;
        expect(refused('CREATE INDEX FOR (s:DrivineStore) ON (s.key)')).toMatch(own);
        expect(refused('CREATE CONSTRAINT FOR (s:DrivineStore) REQUIRE s.other IS UNIQUE')).toMatch(own);
        expect(refused('CREATE TEXT INDEX FOR (s:DrivineStore) ON (s.key)')).toMatch(own);
        expect(refused('CREATE CONSTRAINT FOR (s:DrivineStore) REQUIRE (s.key, s.other) IS UNIQUE')).toMatch(own);
    });

    it("reads a vector index's options of each type, and refuses one of the wrong type or given as a parameter", () => {
        const vectorOf = (config: string): string =>
            `CREATE VECTOR INDEX FOR (c:C) ON c.e OPTIONS {indexConfig: {\`vector.dimensions\`: 3${config}}}`;
        expect(
            translate(vectorOf(', `vector.similarity_function`: null, `vector.quantization.enabled`: TRUE'))
        ).toEqual(
            create(
                vectorIndex('C', 'e', 3, 'COSINE', {
                    engineOptions: [neo4jVectorOptions({ quantizationEnabled: true })]
                }),
                undefined,
                false
            )
        );
        [
            'CREATE VECTOR INDEX FOR (c:C) ON c.e OPTIONS {indexConfig: {`vector.dimensions`: 3.0}}',
            'CREATE VECTOR INDEX FOR (c:C) ON c.e OPTIONS {indexConfig: {`vector.dimensions`: 0.3e1}}',
            "CREATE VECTOR INDEX FOR (c:C) ON c.e OPTIONS {indexConfig: {'vector.dimensions': 3, `vector.hnsw.m`: null}}"
        ].forEach((it) => expect(translate(it)).toEqual(create(vectorIndex('C', 'e', 3), undefined, false)));

        const positive = (key: string, value: string): string =>
            `A vector index's \`${key}\` is a positive whole number, not ${value}.`;
        expect(refused(vectorOf('').replace(': 3', ": '3'"))).toEqual(positive('vector.dimensions', '3'));
        expect(refused(vectorOf('').replace(': 3', ': 2.5'))).toEqual(positive('vector.dimensions', '2.5'));
        expect(refused(vectorOf('').replace(': 3', ': -3'))).toEqual(positive('vector.dimensions', '-3'));
        expect(refused(vectorOf('').replace(': 3', ': 2147483648'))).toEqual(
            positive('vector.dimensions', '2147483648')
        );
        expect(refused(vectorOf(', `vector.hnsw.m`: true'))).toEqual(positive('vector.hnsw.m', 'true'));
        expect(refused(vectorOf(', `vector.hnsw.ef_construction`: [100]'))).toEqual(
            positive('vector.hnsw.ef_construction', '[100]')
        );
        expect(refused(vectorOf(', `vector.similarity_function`: 3'))).toEqual(
            "A vector index's `vector.similarity_function` is 'cosine' or 'euclidean', not 3."
        );
        expect(refused(vectorOf(", `vector.quantization.enabled`: 'yes'"))).toEqual(
            "A vector index's `vector.quantization.enabled` is true or false, not yes."
        );
        expect(refused('CREATE VECTOR INDEX FOR (c:C) ON c.e OPTIONS {indexConfig: [3]}')).toEqual(
            'OPTIONS indexConfig is a map.'
        );
        expect(
            refused('CREATE FULLTEXT INDEX FOR (n:B) ON EACH [n.t] OPTIONS {indexConfig: {`fulltext.analyzer`: 1}}')
        ).toEqual("A full-text index's `fulltext.analyzer` is the name of an analyzer, not 1.");
        expect(refused(vectorOf('').replace(': 3', ': $dimensions'))).toEqual(
            'An option given as a parameter, $dimensions, is not read on a SQL store: write it.'
        );
        expect(refused('CREATE INDEX FOR (p:P) ON (p.a) OPTIONS {1: 2}')).toEqual(
            "Invalid schema command: expected a key, but found '1'."
        );
        expect(refused('CREATE INDEX FOR (p:P) ON (p.a) OPTIONS {a: b}')).toEqual(
            "Invalid schema command: expected a value, but found 'b'."
        );
    });

    it('reads the digits of any script in a number, as drivine4j does, and refuses a name that starts with one', () => {
        const dimensions = (written: string): SchemaDdlResult =>
            translate(
                `CREATE VECTOR INDEX FOR (c:C) ON c.e OPTIONS {indexConfig: {\`vector.dimensions\`: ${written}}}`
            );
        expect(dimensions('٣')).toEqual(create(vectorIndex('C', 'e', 3), undefined, false));
        expect(dimensions('１٥३६')).toEqual(create(vectorIndex('C', 'e', 1536), undefined, false));
        expect(dimensions('٣.٠')).toEqual(create(vectorIndex('C', 'e', 3), undefined, false));
        expect(translate('CREATE INDEX FOR (p:P٣) ON (p.a٣)')).toEqual(
            create(rangeIndex('P٣', 'a٣'), undefined, false)
        );
        expect(refused('CREATE INDEX FOR (p:P) ON (p.٣a)')).toEqual(
            "Invalid schema command: expected property, but found '٣'."
        );
    });

    it('reads comments anywhere, keywords in any case, and one statement with or without a ;', () => {
        expect(
            translate(
                '/* made */ Create /* a */ Constraint // named\n email If Not Exists For (p:P) Require p.a Is Node Unique Options {} ; // done'
            )
        ).toEqual(create(uniquenessConstraint('P', 'a'), 'email', true));
        expect(translate('call db.awaitIndexes;')).toEqual(AWAIT);
        expect(translate('CALL DB.AWAITINDEXES')).toEqual(NOT_DDL);
        expect(refused('CREATE INDEX FOR (p:P) ON (p.a);;')).toEqual(
            "Invalid schema command: expected the end of the schema command, which runs on its own, but found ';'."
        );
        expect(refused('DROP INDEX a; DROP INDEX b')).toContain('runs on its own');
        expect(refused('DROP INDEX a b')).toEqual(
            "Invalid schema command: expected the end of the schema command, which runs on its own, but found 'b'."
        );
    });
});
