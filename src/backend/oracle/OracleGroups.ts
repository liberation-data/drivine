import { jsonKey, OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleQueryRenderer } from '@/backend/oracle/OracleQueryRenderer';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { SqlGroups } from '@/backend/sql/SqlGroups';

/** A grouped read on Oracle (see SqlGroups): a property key held as its JSON text, read back with JSON(). */
export class OracleGroups extends SqlGroups {
    protected views(): OracleViews {
        return new OracleViews(this.graph as OracleGraph);
    }

    protected renderer(views: OracleViews): OracleQueryRenderer {
        return new OracleQueryRenderer(views);
    }

    protected keyColumn(property: string): string {
        return `JSON_SERIALIZE(JSON_QUERY(n.props, '$${jsonKey(property)}' RETURNING JSON))`;
    }

    protected keyValue(column: string): string {
        return `JSON(${column})`;
    }

    protected idValue(property: string): string {
        return `JSON_QUERY(p.props, '$${jsonKey(property)}' RETURNING JSON)`;
    }
}
