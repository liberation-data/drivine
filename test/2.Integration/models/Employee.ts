export class Employee {
    readonly id: number;
    readonly name: string;
    readonly joined: Date;

    constructor(id: number, name: string, joined: Date) {
        this.id = id;
        this.name = name;
        this.joined = joined;
    }
}
