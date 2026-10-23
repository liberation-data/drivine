import { StatelessGraphObjectManager } from '@liberation-data/drivine';
import { Organization } from '../../src/fragment/Organization';
import { PersonCareer } from '../../src/view/PersonCareer';
import { PersonContext } from '../../src/view/PersonContext';

/** The people and organizations the Lambda reads and writes, through the object manager it is handed. */
export class PeopleRepository {
    constructor(readonly gom: StatelessGraphObjectManager) {}

    /** Everyone whose bio mentions leading, in any case, by name. */
    async leads(): Promise<PersonCareer[]> {
        return this.gom.loadAll(PersonCareer, (q) => ({
            where: q.person.bio.containsIgnoreCase('lead'),
            orderBy: q.person.name.asc()
        }));
    }

    async organizationNamed(name: string): Promise<Organization | undefined> {
        return (await this.gom.loadAll(Organization, (q) => ({ where: q.name.eq(name) })))[0];
    }

    /** How many people work for the organization. */
    async headcount(organization: Organization): Promise<number> {
        return this.gom.count(PersonContext, (q) => ({ where: q.worksFor.uuid.eq(organization.uuid) }));
    }

    async save(career: PersonCareer): Promise<PersonCareer> {
        return this.gom.save(career);
    }
}
