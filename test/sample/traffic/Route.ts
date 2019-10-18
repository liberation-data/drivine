import { Expose } from 'class-transformer';

export class Route {
    public readonly start: string;
    public readonly destination: string;
    public readonly metros: string[];
    @Expose({ name: 'travel_time' })
    public readonly travelTime: number;

    public constructor(start: string, destination: string, metros: string[], travelTime: number) {
        this.start = start;
        this.destination = destination;
        this.metros = metros;
        this.travelTime = travelTime;
    }

    /**
     * Returns metros omitting the start and destination.
     */
    public intermediateMetros(): string[] {
        const result = [...this.metros];
        result.shift();
        result.pop();
        return result;
    }

    public toString(): string {
        return `From ${this.start} to ${this.destination} via ${this.intermediateMetros()} takes ${
            this.travelTime
        } minutes.\n`;
    }
}
