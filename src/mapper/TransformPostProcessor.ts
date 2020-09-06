import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';
import { ClassType } from '@/query';
import { plainToClass } from 'class-transformer';

export class TransformPostProcessor implements ResultPostProcessor {

    constructor(readonly type: ClassType<any>) {
    }

    apply(results: any[]): any[] {
        return plainToClass(this.type, results);
    }

}
