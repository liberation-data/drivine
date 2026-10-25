import { DrivineError } from '@/DrivineError';
import { Expression } from '@/cypher/ast/Expression';
import { Clause, Projection, ProjectionItem, Query } from '@/cypher/ast/Query';

/** The query's own variables, named with `#`, which a statement cannot write, so they meet none of the statement's. */
const ROW = '#procedure';
const VALUE = '#procedureValue';

/**
 * A procedure the compiler takes, `CALL db.labels()`, read as the query that gives its rows: a SQL store keeps no
 * catalog of labels or types beside its nodes and relationships, so they are read from those, each once, as Neo4j lists
 * only the labels and types that something has now. Its one `field` is what it yields.
 *
 * A `CALL` within a query reads the variables around it, for a `WHERE` after its `YIELD`.
 */
export interface CypherProcedure {
    /** Its name, as Neo4j names it, case and all. */
    readonly qualifiedName: string;
    /** What it yields. */
    readonly field: string;
    /** The label or type, in the scope `reading` gives. */
    readonly value: Expression;
    /** The clauses that read each label or type, once for each node or relationship that has it. */
    reading(): Clause[];
}

const variable = (name: string): Expression => ({ kind: 'Variable', name });

const PROCEDURES: CypherProcedure[] = [
    {
        qualifiedName: 'db.labels',
        field: 'label',
        reading: () => [
            {
                kind: 'Match',
                optional: false,
                patterns: [{ nodes: [{ variable: ROW, labels: [] }], relationships: [] }]
            },
            {
                kind: 'Unwind',
                list: { kind: 'Function', name: 'labels', distinct: false, arguments: [variable(ROW)] },
                variable: VALUE
            }
        ],
        value: variable(VALUE)
    },
    {
        qualifiedName: 'db.relationshipTypes',
        field: 'relationshipType',
        reading: () => [
            {
                kind: 'Match',
                optional: false,
                patterns: [
                    {
                        nodes: [{ labels: [] }, { labels: [] }],
                        relationships: [{ variable: ROW, types: [], direction: 'OUTGOING' }]
                    }
                ]
            }
        ],
        value: { kind: 'Function', name: 'type', distinct: false, arguments: [variable(ROW)] }
    }
];

export const CypherProcedures = {
    /** The procedure named `name`, as Neo4j names it, case and all; undefined for one the compiler does not take. */
    named(name: string): CypherProcedure | undefined {
        return PROCEDURES.find((it) => it.qualifiedName === name);
    },

    /**
     * The procedure's rows, each value once, as the query that returns them: each field yielded under its variable,
     * `yields` pairs of the two, and with `where`, only the rows that meet it.
     */
    query(
        procedure: CypherProcedure,
        args: Expression[],
        yields: [string, string][],
        where: Expression | undefined
    ): Query {
        if (args.length > 0) {
            throw new DrivineError(`${procedure.qualifiedName}() takes no argument.`);
        }
        for (const [yielded] of yields) {
            if (yielded !== procedure.field) {
                throw new DrivineError(`${procedure.qualifiedName}() yields ${procedure.field}, not ${yielded}.`);
            }
        }
        const variables = yields.map(([, it]) => it);
        const projection = (distinct: boolean, items: ProjectionItem[]): Projection => ({
            distinct,
            star: false,
            items,
            orderBy: []
        });
        const distinct = projection(
            true,
            variables.map((name) => ({ expression: procedure.value, name }))
        );
        const clauses: Clause[] =
            where === undefined
                ? [...procedure.reading(), { kind: 'Return', projection: distinct }]
                : [
                      ...procedure.reading(),
                      { kind: 'With', projection: distinct, where },
                      {
                          kind: 'Return',
                          projection: projection(
                              false,
                              variables.map((name) => ({ expression: variable(name), name }))
                          )
                      }
                  ];
        return { clauses, unions: [] };
    }
};
