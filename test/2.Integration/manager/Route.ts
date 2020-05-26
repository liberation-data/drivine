import { Expose } from 'class-transformer';

export class Route {
    readonly start: string;
    readonly destination: string;
    readonly metros: string[];
    @Expose({ name: 'travel_time' })
    readonly travelTime: number;

    constructor(start: string, destination: string, metros: string[], travelTime: number) {
        this.start = start;
        this.destination = destination;
        this.metros = metros;
        this.travelTime = travelTime;
    }

    /**
     * Returns metros omitting the start and destination.
     */
    intermediateMetros(): string[] {
        const result = [...this.metros];
        result.shift();
        result.pop();
        return result;
    }

    toString(): string {
        return `From ${this.start} to ${this.destination} via ${this.intermediateMetros()} takes ${
            this.travelTime
        } minutes.\n`;
    }
}
