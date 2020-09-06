import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';

export class FilterPostProcessor implements ResultPostProcessor {

    constructor(readonly filterFunction: (result: any) => boolean) {
    }

    apply(results: any[]): any[] {
        return results.filter((it) => this.filterFunction(it));
    }


}
