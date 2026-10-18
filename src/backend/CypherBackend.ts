import { GraphBackend } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { fragment, ViewProjector } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import { TargetModel } from '@/model/RelationshipModel';
import { CascadeType } from '@/manager/CascadeType';
import { CascadeTargets } from '@/backend/CascadeTargets';
import { SaveStatementBuilder } from '@/backend/SaveStatementBuilder';
import { SaveStatement } from '@/backend/SaveStatement';
import { STAMP } from '@/backend/CypherStamps';
import { Stamps } from '@/model/Stamps';
import { SaveOptions } from '@/manager/SaveOptions';

/** What a statement over a fragment calls its node. Filters are written against it. */
export const NODE_ALIAS = 'n';

export class CypherBackend implements GraphBackend {
    constructor(readonly grammar: CypherGrammar) {}

    loadAllFragments(model: FragmentModel, where?: string): GraphStatement {
        return new GraphStatement([this.match(model), this.where(where), this.projectFragment()].join(''));
    }

    loadFragment(model: FragmentModel): GraphStatement {
        return this.loadAllFragments(model, this.idPredicate(model));
    }

    countFragments(model: FragmentModel, where?: string): GraphStatement {
        return new GraphStatement([this.match(model), this.where(where), `\nRETURN count(${NODE_ALIAS}) AS count`].join(''));
    }

    loadAllViews(model: GraphViewModel, where?: string): GraphStatement {
        const projection = new ViewProjector(this.grammar).project(model, NODE_ALIAS);
        return new GraphStatement(
            [
                this.match(model.root),
                this.viewWhere(model, where),
                ...projection.calls.map((it) => `\n${it}`),
                `\nRETURN ${projection.expression} AS result`
            ].join('')
        );
    }

    loadView(model: GraphViewModel): GraphStatement {
        return this.loadAllViews(model, this.idPredicate(model.root));
    }

    countViews(model: GraphViewModel, where?: string): GraphStatement {
        return new GraphStatement(
            [this.match(model.root), this.viewWhere(model, where), `\nRETURN count(${NODE_ALIAS}) AS count`].join('')
        );
    }

    delete(target: TargetModel, where?: string, cascade: CascadeType = CascadeType.NONE): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const id = this.idPredicate(root);
        const filter = where ? `${id} AND (${where})` : id;
        const head = [this.match(root), this.rootWhere(target, filter)].join('');
        if (cascade === CascadeType.NONE) {
            return new GraphStatement(`${head}\nDETACH DELETE ${NODE_ALIAS}\nRETURN count(*) AS deleted`);
        }
        if (target.kind !== 'GRAPH_VIEW') {
            throw new DrivineError(`A cascade follows a view's relationships. ${root.type.name} is a @NodeFragment.`);
        }
        if (cascade === CascadeType.DELETE_ORPHAN && this.grammar.orphanDeleteLimit) {
            throw new DrivineError(`CascadeType.DELETE_ORPHAN is not available on ${this.grammar.engine}: ${this.grammar.orphanDeleteLimit}.`);
        }
        const targets = new CascadeTargets(this.grammar).of(target.model, NODE_ALIAS);
        const deletable =
            cascade === CascadeType.DELETE_ALL
                ? 'targets'
                : `[x IN targets WHERE NOT ${this.grammar.existenceCheck('(x)--()')}]`;
        return new GraphStatement(
            [
                head,
                // WITH before the list: FalkorDB errors on a WHERE and a projection that both hold comprehensions
                // (FalkorDB/FalkorDB#3387).
                `\nWITH ${NODE_ALIAS}`,
                `\nWITH ${NODE_ALIAS}, ${targets} AS targets`,
                `\nDETACH DELETE ${NODE_ALIAS}`,
                `\nWITH targets`,
                `\nFOREACH (t IN ${deletable} | DETACH DELETE t)`,
                `\nRETURN count(*) AS deleted`
            ].join('')
        );
    }

    deleteAll(target: TargetModel, where?: string): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        return new GraphStatement(
            [this.match(root), this.rootWhere(target, where), `\nDETACH DELETE ${NODE_ALIAS}\nRETURN count(*) AS deleted`].join('')
        );
    }

    save(target: TargetModel, object: any, options?: SaveOptions<any>): SaveStatement {
        return new SaveStatementBuilder(this.grammar).build(target, object, options);
    }

    foundStamp(model: FragmentModel): GraphStatement {
        return new GraphStatement(
            `${this.match(model)}\nWHERE ${this.idPredicate(model)}\nRETURN coalesce(${NODE_ALIAS}.${STAMP}, '${Stamps.NEVER_STAMPED}') AS found`
        );
    }

    contended(failure: unknown): boolean {
        // The driver's error is the root cause of the DrivineError the persistence manager throws.
        let cause: any = failure;
        for (let depth = 0; cause && depth < 10; depth++) {
            if (this.grammar.contended(cause)) {
                return true;
            }
            cause = cause.rootCause ?? cause.cause;
        }
        return false;
    }

    private rootWhere(target: TargetModel, where?: string): string {
        return target.kind === 'GRAPH_VIEW' ? this.viewWhere(target.model, where) : this.where(where);
    }

    private viewWhere(model: GraphViewModel, where?: string): string {
        const requirements = new ViewProjector(this.grammar).requirements(model, NODE_ALIAS);
        if (!requirements.length) {
            return this.where(where);
        }
        // Parentheses only where needed: FalkorDB 6 plans a WHERE worse with ones it doesn't need.
        return this.where([...(where ? [`(${where})`] : []), ...requirements].join(' AND '));
    }

    private match(model: FragmentModel): string {
        return `MATCH (${NODE_ALIAS}${labelExpression(model.labels)})`;
    }

    private where(predicate?: string): string {
        return predicate ? `\nWHERE ${predicate}` : '';
    }

    /**
     * The whole node: TypeScript keeps no list of a class's properties to name them by. Labels are returned apart
     * from the properties, so a property called `labels` can't be mistaken for them.
     */
    private projectFragment(): string {
        return `\nRETURN ${fragment(NODE_ALIAS)} AS result`;
    }

    private idPredicate(model: FragmentModel): string {
        if (!model.nodeIdProperty) {
            throw new DrivineError(`${model.type.name} has no @NodeId property, so it can't be loaded by id.`);
        }
        return `${NODE_ALIAS}.${quoteName(model.nodeIdProperty)} = $id`;
    }
}
