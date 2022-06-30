import { ResultMapper } from '@/mapper/ResultMapper';
import { AgensGraphResultMapper, DrivineError, QuerySpecification } from '@liberation-data/drivine';
import { AgensRowResultMapper } from '@/mapper/AgensRowResultMapper';

export class AgensResultMapper implements ResultMapper {

    private readonly graphMapper: ResultMapper = new AgensGraphResultMapper()
    private readonly rowMapper: ResultMapper = new AgensRowResultMapper();

    mapQueryResults<T>(results: any[], spec: QuerySpecification<T>): T[] {
        switch (spec.statement.language) {
            case 'CYPHER':
                return this.graphMapper.mapQueryResults(results, spec);
            case 'SQL':
                return this.rowMapper.mapQueryResults(results, spec);
            default:
                throw new DrivineError(`${spec.statement.language} does not have a supported result mapper.`);
        }
    }

}
