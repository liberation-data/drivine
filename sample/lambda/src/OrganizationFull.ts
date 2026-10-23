/** Thrown when a hire would take an organization past its headcount. */
export class OrganizationFull extends Error {
    constructor(
        readonly organization: string,
        readonly limit: number
    ) {
        super(`${organization} already has ${limit} people`);
    }
}
