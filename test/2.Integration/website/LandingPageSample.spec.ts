import {
    CypherBackend,
    cypherGrammarFor,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    RelationshipFragment,
    Root,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// The landing page's TypeScript sample (website/src/pages/index.astro), as written, so the site can't drift from the
// API. Only WorkHistory and Organization, which the sample leaves out, are added here.

@NodeFragment({ labels: ['Person'] })
export class Person {
    @NodeId() uuid: string;
    name: string;
    bio?: string;
}

@NodeFragment({ labels: ['Organization'] })
class Organization {
    @NodeId() uuid: string;
    name: string;
}

@RelationshipFragment()
class WorkHistory {
    role: string;
    @TargetNode() organization: Organization;
}

@GraphView()
export class PersonCareer {
    @Root() person: Person;

    @GraphRelationship({ type: 'WORKS_FOR', target: () => WorkHistory })
    employmentHistory: WorkHistory[] = [];
}

describe.each(graphEngines())('The landing page sample on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    const cleanUp = async () =>
        pm.execute(new QuerySpecification("MATCH (n) WHERE n.uuid STARTS WITH 'landing-' DETACH DELETE n"));

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
        await cleanUp();
        await pm.execute(
            new QuerySpecification(
                "CREATE (lead:Person {uuid: 'landing-lead', name: 'Lead', bio: 'Design Lead'}), " +
                    "(dev:Person {uuid: 'landing-dev', name: 'Dev', bio: 'Developer'}), " +
                    "(org:Organization {uuid: 'landing-org', name: 'Studio'}), " +
                    "(lead)-[:WORKS_FOR {role: 'Lead'}]->(org), (dev)-[:WORKS_FOR {role: 'Dev'}]->(org)"
            )
        );
    });

    afterAll(async () => {
        await cleanUp();
        await closeGraphEngines();
    });

    it('should load everyone whose bio mentions leading', async () => {
        // Everyone whose bio mentions leading
        const leads = await gom.loadAll(PersonCareer, (q) => ({
            where: q.person.bio.contains('Lead')
        }));

        const ours = leads.filter((it) => it.person.uuid.startsWith('landing-'));
        expect(ours.map((it) => it.person.name)).toEqual(['Lead']);
        expect(ours[0].employmentHistory.map((it) => [it.role, it.organization.name])).toEqual([['Lead', 'Studio']]);
    });
});
