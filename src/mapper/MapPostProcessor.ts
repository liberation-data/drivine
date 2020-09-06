import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';

export class MapPostProcessor implements ResultPostProcessor {

    constructor(readonly mapFunction: (result: any) => any) {
    }

    apply(results: any[]): any[] {
        return results.map((it) => this.mapFunction(it));
    }

}
