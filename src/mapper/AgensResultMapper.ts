import { ResultMapper } from '@/mapper/ResultMapper';
import { AgensGraphResultMapper, DrivineError, QuerySpecification } from '@liberation-data/drivine';
import { AgensRowResultMapper } from '@/mapper/AgensRowResultMapper';
import { ResultSet } from '@/resultset/ResultSet';

export class AgensResultMapper<T> implements ResultMapper {

    private readonly graphMapper: ResultMapper = new AgensGraphResultMapper()
    private readonly rowMapper: ResultMapper = new AgensRowResultMapper();

    mapQueryResults<T>(resultSet: ResultSet, spec: QuerySpecification<T>): T[] {
        switch (spec.statement.language) {
            case 'CYPHER':
                return this.graphMapper.mapQueryResults(resultSet, spec);
            case 'SQL':
                return this.rowMapper.mapQueryResults(resultSet, spec);
            default:
                throw new DrivineError(`${spec.statement.language} does not have a supported result mapper.`);
        }
    }

}
