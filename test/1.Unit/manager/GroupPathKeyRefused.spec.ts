import {
    backendFor,
    count,
    DatabaseType,
    Direction,
    DrivineError,
    hop,
    ModelRegistry,
    NodeFragment,
    NodeId,
    pathKey
} from '@liberation-data/drivine';
import { GroupOperations } from '@/manager/GroupOperations';

@NodeFragment({ labels: ['Message'] })
class Message {
    @NodeId() id: string;
    tokens?: number;
}

@NodeFragment({ labels: ['User'] })
class User {
    @NodeId() id: string;
}

/** A node with no @NodeId, which a path key can't order its groups by. */
@NodeFragment({ labels: ['Tag'] })
class Tag {
    name?: string;
}

const STORES = [
    DatabaseType.NEO4J,
    DatabaseType.MEMGRAPH,
    DatabaseType.FALKORDB,
    DatabaseType.SQLITE,
    DatabaseType.POSTGRES,
    DatabaseType.ORACLE
];

/**
 * A grouped read keyed by a related node is ordered by the node's id, so a path key ending at a fragment with no
 * @NodeId is refused by name on every store, before a statement is written or a lookup is run (#786), as drivine4j's
 * GroupQuery refuses it.
 */
describe.each(STORES)('A path key on %s', (type) => {
    const registry = new ModelRegistry();
    let statements: any[];
    let lookups: number;
    const groups = (): GroupOperations =>
        new GroupOperations(
            registry,
            async (statement) => {
                statements.push(statement);
                return Promise.resolve([]);
            },
            undefined as any,
            backendFor(type),
            async (_, where) => {
                lookups++;
                return Promise.resolve(where);
            }
        );

    beforeEach(() => {
        statements = [];
        lookups = 0;
    });

    it('is refused by name when its node has no @NodeId, before anything is written', async () => {
        const read = groups().load(Message, (q: any) => ({
            keys: { tag: pathKey(Tag, [hop('TAGGED', Direction.OUTGOING)]) },
            aggregates: { messages: count() },
            where: q.tokens.gt(1)
        }));
        await expect(read).rejects.toThrow(DrivineError);
        await expect(read).rejects.toThrow('Tag has no @NodeId field, which a path key is ordered by.');
        expect(statements).toEqual([]);
        expect(lookups).toEqual(0);
    });

    it('is refused when it is one key among others', async () => {
        await expect(
            groups().load(Message, {
                keys: {
                    user: pathKey(User, [hop('HAS_MESSAGE', Direction.INCOMING, 'ChatSession'), hop('OWNED_BY')]),
                    tag: pathKey(Tag, [hop('TAGGED')])
                },
                orderBy: [['user', 'asc']]
            })
        ).rejects.toThrow('Tag has no @NodeId field, which a path key is ordered by.');
        expect(statements).toEqual([]);
    });

    it('is written when its node has a @NodeId', async () => {
        await groups().load(Message, {
            keys: { user: pathKey(User, [hop('HAS_MESSAGE', Direction.INCOMING, 'ChatSession'), hop('OWNED_BY')]) },
            aggregates: { messages: count() }
        });
        expect(statements).toHaveLength(1);
        expect(statements[0].text).not.toContain('undefined');
    });
});
