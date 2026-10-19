import { randomUUID } from 'crypto';
import { StatelessGraphObjectManager } from '@liberation-data/drivine';
import { IssueCore, Organization, Person, PersonContext, RaisedAndAssignedIssue } from '../../src';

/**
 * Writes the issue the sample's DSL tests share, through the object manager: one issue, assigned to and raised by one
 * person, who works for one organization.
 */
export async function seedIssue(
    gom: StatelessGraphObjectManager,
    fields: { id: number; title: string; body: string; person: string; bio: string; org: string }
): Promise<void> {
    const person = Object.assign(new Person(), { uuid: randomUUID(), name: fields.person, bio: fields.bio });
    const org = Object.assign(new Organization(), { uuid: randomUUID(), name: fields.org });
    await gom.save(
        Object.assign(new RaisedAndAssignedIssue(), {
            issue: Object.assign(new IssueCore(), {
                uuid: randomUUID(),
                id: fields.id,
                title: fields.title,
                body: fields.body,
                state: 'open',
                locked: false
            }),
            assignedTo: [person],
            raisedBy: Object.assign(new PersonContext(), { person, worksFor: [org] })
        })
    );
}
