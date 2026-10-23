import {
    ConnectionProvider,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    GraphProperty,
    NodeFragment,
    NodeId,
    SchemaCatalog,
    SchemaManager,
    SchemaSpec,
    GraphTransient,
    vectorIndex,
    VectorIndex
} from '@liberation-data/drivine';
import { ModelRegistry } from '@/model/ModelRegistry';

// What the check sees lasts for the test file's module registry, so every fragment here has a label of its own.

@NodeFragment({ labels: ['CheckMessageLater'] })
class CheckMessageLater {
    @NodeId() id: string;
    embedding: number[] = [];
}

@NodeFragment({ labels: ['CheckEnsured'] })
class CheckEnsured {
    @NodeId() id: string;
    embedding: number[] = [];
}

@NodeFragment({ labels: ['CheckMessageFirst'] })
class CheckMessageFirst {
    @NodeId() id: string;
    embedding: number[] = [];
}

@NodeFragment({ labels: ['CheckRenamed'] })
class CheckRenamed {
    @NodeId() id: string;
    @GraphProperty('embedding_vec') vector?: number[];
}

@NodeFragment({ labels: ['CheckRenamedAway'] })
class CheckRenamedAway {
    @NodeId() id: string;
    @GraphProperty('other') embedding?: number[];
}

@NodeFragment({ labels: ['CheckTransient'] })
class CheckTransient {
    @NodeId() id: string;
    @GraphTransient() embedding?: number[];
}

@NodeFragment({ labels: ['CheckChunk', 'CheckContent'] })
class CheckChunk {
    @NodeId() id: string;
    embedding: number[] = [];
}

@NodeFragment({ labels: ['CheckBase'] })
class CheckBase {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['CheckDerived'] })
class CheckDerived extends CheckBase {
    embedding: number[] = [];
}

@NodeFragment({ labels: ['CheckTwoFields'] })
class CheckTwoFields {
    @NodeId() id: string;
    embedding: number[] = [];
    summary: number[] = [];
}

@NodeFragment({ labels: ['CheckUndeclared'] })
class CheckUndeclared {
    @NodeId() id: string;
    embedding?: number[];
}

@NodeFragment({ labels: ['CheckConstructed'] })
class CheckConstructed {
    @NodeId() id: string;
    @GraphProperty('embedding') vector?: number[];
    constructor(from: { id: string }) {
        this.id = from.id;
    }
}

@NodeFragment({ labels: ['CheckBeforeWrite'] })
class CheckBeforeWrite {
    @NodeId() id: string;
    embedding: number[] = [];
}

@NodeFragment({ labels: ['CheckAnnotated'] })
class CheckAnnotated {
    @NodeId() id: string;
    @VectorIndex() embedding?: number[];
}

@NodeFragment({ labels: ['CheckAnnotatedLater'] })
class CheckAnnotatedLater {
    @NodeId() id: string;
    @VectorIndex() embedding?: number[];
}

/**
 * A vector index declared in a catalog over a fragment field that has no @VectorIndex is refused, whichever of the two
 * Drivine sees first. No database is registered, so enforce gets as far as the check and then has nowhere to apply.
 */
describe('A vector index spec over a fragment field', () => {
    const factory = {
        get: () => {
            throw new Error('No database is spoken to.');
        }
    } as unknown as GraphObjectManagerFactory;
    const enforce = async (...catalogs: SchemaCatalog[]) => new SchemaManager(factory, { catalogs }).enforce();
    const enforceSpecs = async (...specs: SchemaSpec[]) => enforce(SchemaCatalog.of(...specs));
    const build = (type: Function) => new ModelRegistry().fragment(type as any);
    const message = (field: string, spec: string): string =>
        `\`${field}\` is covered by the vector index on \`${spec}\` but is not annotated \`@VectorIndex\`. Add the ` +
        'annotation: without it the field is not written as a vector on FalkorDB, and `loadNearest` cannot find its index.';

    it("should be refused when a catalog is applied over a known fragment's unannotated field", async () => {
        build(CheckMessageLater);
        await expect(enforceSpecs(vectorIndex('CheckMessageLater', 'embedding', 4))).rejects.toThrow(
            message('CheckMessageLater.embedding', 'CheckMessageLater.embedding')
        );
    });

    it("should be refused when ensured at runtime over a known fragment's unannotated field, and not kept", async () => {
        build(CheckEnsured);
        const manager = new SchemaManager(factory, { catalogs: [] });

        await expect(manager.ensure('rag', vectorIndex('CheckEnsured', 'embedding', 4))).rejects.toThrow(
            message('CheckEnsured.embedding', 'CheckEnsured.embedding')
        );
        // Refused before it was kept, so the manager has nothing to apply.
        await expect(manager.enforce()).resolves.toEqual(new Map());
    });

    it('should refuse a fragment built after a catalog indexed its unannotated field, every time', async () => {
        await enforceSpecs(vectorIndex('CheckMessageFirst', 'embedding', 4));
        expect(() => build(CheckMessageFirst)).toThrow(
            message('CheckMessageFirst.embedding', 'CheckMessageFirst.embedding')
        );
        // Refused every time, not only the first.
        expect(() => build(CheckMessageFirst)).toThrow(/CheckMessageFirst.embedding/);
        const registry = new ModelRegistry();
        expect(() => registry.fragment(CheckMessageFirst)).toThrow();
        expect(() => registry.fragment(CheckMessageFirst)).toThrow();
    });

    it('should match a field by the property it is stored under', async () => {
        build(CheckRenamed);
        build(CheckRenamedAway);
        build(CheckTransient);
        await expect(enforceSpecs(vectorIndex('CheckRenamed', 'embedding_vec', 4))).rejects.toThrow(
            message('CheckRenamed.vector', 'CheckRenamed.embedding_vec')
        );
        // Stored under "other", or neither loaded nor saved, so a spec on "embedding" covers nothing of it.
        await expect(enforceSpecs(vectorIndex('CheckRenamedAway', 'embedding', 4))).resolves.toEqual(new Map());
        await expect(enforceSpecs(vectorIndex('CheckTransient', 'embedding', 4))).resolves.toEqual(new Map());
    });

    it("should count a spec on any of a fragment's labels, inherited ones too", async () => {
        build(CheckChunk);
        build(CheckDerived);
        await expect(enforceSpecs(vectorIndex('CheckContent', 'embedding', 4))).rejects.toThrow(
            message('CheckChunk.embedding', 'CheckContent.embedding')
        );
        await expect(enforceSpecs(vectorIndex('CheckBase', 'embedding', 4))).rejects.toThrow(
            message('CheckDerived.embedding', 'CheckBase.embedding')
        );
    });

    it('should report every uncovered field, once however many specs cover it', async () => {
        build(CheckTwoFields);
        // Two owners may declare the same index; the field is still reported once.
        await expect(
            enforce(
                SchemaCatalog.of(vectorIndex('CheckTwoFields', 'embedding', 4)).named('check-a'),
                SchemaCatalog.of(
                    vectorIndex('CheckTwoFields', 'embedding', 4),
                    vectorIndex('CheckTwoFields', 'summary', 4)
                ).named('check-b')
            )
        ).rejects.toThrow(
            message('CheckTwoFields.embedding', 'CheckTwoFields.embedding') +
                '\n' +
                message('CheckTwoFields.summary', 'CheckTwoFields.summary')
        );
    });

    it('should check a class whose constructor needs its arguments by its decorated fields', async () => {
        build(CheckConstructed);
        await expect(enforceSpecs(vectorIndex('CheckConstructed', 'embedding', 4))).rejects.toThrow(
            message('CheckConstructed.vector', 'CheckConstructed.embedding')
        );
    });

    it('should allow a spec for a label no fragment maps', async () => {
        await expect(enforceSpecs(vectorIndex('CheckCypherOnly', 'embedding', 4))).resolves.toEqual(new Map());
    });

    it('should not see a field with neither a decorator nor an initializer, which leaves no trace', async () => {
        build(CheckUndeclared);
        await expect(enforceSpecs(vectorIndex('CheckUndeclared', 'embedding', 4))).resolves.toEqual(new Map());
    });

    it('should allow the decorator beside a spec, whichever comes first', async () => {
        build(CheckAnnotated);
        // The catalog's declaration is how an index is tuned, so a different similarity is no conflict.
        await expect(enforceSpecs(vectorIndex('CheckAnnotated', 'embedding', 4, 'EUCLIDEAN'))).resolves.toEqual(
            new Map()
        );

        await enforceSpecs(vectorIndex('CheckAnnotatedLater', 'embedding', 4));
        expect(() => build(CheckAnnotatedLater)).not.toThrow();
    });

    describe('with a graph database registered', () => {
        beforeEach(() => DatabaseRegistry.tearDown());
        afterAll(() => DatabaseRegistry.tearDown());

        it('should be refused before the database is spoken to, by enforce and by ensure', async () => {
            DatabaseRegistry.getInstance().register({ name: 'a', type: DatabaseType.NEO4J } as ConnectionProvider);
            build(CheckBeforeWrite);
            const spec = vectorIndex('CheckBeforeWrite', 'embedding', 4);
            const refusal = message('CheckBeforeWrite.embedding', 'CheckBeforeWrite.embedding');

            // The factory throws when asked for the database, so any other error means it was reached first.
            await expect(enforceSpecs(spec)).rejects.toThrow(refusal);
            await expect(new SchemaManager(factory, { catalogs: [] }).ensure('rag', spec)).rejects.toThrow(refusal);
        });
    });
});
