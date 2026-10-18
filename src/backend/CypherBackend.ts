import { GraphBackend } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { fragment, ViewProjector } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';

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
