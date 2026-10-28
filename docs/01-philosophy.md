## Philosophy

### Composition Over Inheritance

A typical ORM defines one reusable object model, and generates statements to move data between that model and the
database. That addresses the so-called impedance mismatch, at a cost:

* Generated queries work well for simple cases, but can get out of hand and perform badly when things get complex.
  Debugging generated statements can be painful.
* One model for many use cases is a big ask. The original CRUD cases work well, but in harder cases the model gets in
  the way more than it helps.

Those trade-offs may be acceptable for a relational database, but with a graph database the mismatch hardly exists.

Just as we favour composition over inheritance in software, we prefer composition when mapping the results of complex
queries. A person plays many roles: sometimes we help them have a great holiday, sometimes they manage a team,
sometimes they're a person of interest. With Drivine you compose a view for each use case:

```typescript
@GraphView()
export class HolidayingPerson {
    @Root() person: Person;

    @GraphRelationship({ type: 'BOOKED_HOLIDAY', target: () => Holiday })
    holidays: Holiday[];
}
```

Behind the scenes, Drivine writes one efficient statement:

```cypher
MATCH (person:Person)
WITH person, [(person)-[:BOOKED_HOLIDAY]->(holiday:Holiday) | holiday {.*}] AS holidays
RETURN { person: properties(person), holidays: holidays }
```

Composition lets you mix and match as needed.
