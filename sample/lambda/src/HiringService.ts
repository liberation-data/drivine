import { randomUUID } from 'crypto';
import { Transactional } from '@liberation-data/drivine';
import { Organization } from '../../src/fragment/Organization';
import { Person } from '../../src/fragment/Person';
import { WorkHistory } from '../../src/fragment/WorkHistory';
import { PersonCareer } from '../../src/view/PersonCareer';
import { OrganizationFull } from './OrganizationFull';
import { PeopleRepository } from './PeopleRepository';

/** Someone to hire: who, where, and in what role. */
export interface Hire {
    name: string;
    bio?: string;
    organization: string;
    role: string;
    /** A calendar date, YYYY-MM-DD: today when it is left out. */
    startDate?: string;
}

export class HiringService {
    constructor(
        readonly people: PeopleRepository,
        readonly headcountLimit: number
    ) {}

    async leads(): Promise<PersonCareer[]> {
        return this.people.leads();
    }

    /**
     * Saves the person, the organization when it is new, and the WORKS_FOR between them, then checks the headcount,
     * which sees the save: they are one transaction. Past the limit it throws, and the transaction rolls back, so
     * nothing of the hire is kept. On FalkorDB, which commits each statement by itself, the save stays.
     */
    @Transactional()
    async hire(hire: Hire): Promise<PersonCareer> {
        const organization =
            (await this.people.organizationNamed(hire.organization)) ??
            Object.assign(new Organization(), { uuid: randomUUID(), name: hire.organization });
        const person = Object.assign(new Person(), { uuid: randomUUID(), name: hire.name, bio: hire.bio });
        const job = Object.assign(new WorkHistory(), {
            target: organization,
            role: hire.role,
            startDate: hire.startDate ?? new Date().toISOString().slice(0, 10)
        });
        const career = await this.people.save(Object.assign(new PersonCareer(), { person, employmentHistory: [job] }));
        if ((await this.people.headcount(organization)) > this.headcountLimit) {
            throw new OrganizationFull(organization.name, this.headcountLimit);
        }
        return career;
    }
}
