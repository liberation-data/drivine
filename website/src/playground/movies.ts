/** The playground's graph: a few films and the people who made them, written by one CREATE. */
export const MOVIES = `
CREATE (matrix:Movie {title: 'The Matrix', released: 1999, tagline: 'Welcome to the Real World'}),
       (reloaded:Movie {title: 'The Matrix Reloaded', released: 2003, tagline: 'Free your mind'}),
       (johnWick:Movie {title: 'John Wick', released: 2014, tagline: 'Don\\'t set him off'}),
       (speed:Movie {title: 'Speed', released: 1994, tagline: 'Get ready for rush hour'}),
       (keanu:Person {name: 'Keanu Reeves', born: 1964}),
       (carrie:Person {name: 'Carrie-Anne Moss', born: 1967}),
       (laurence:Person {name: 'Laurence Fishburne', born: 1961}),
       (hugo:Person {name: 'Hugo Weaving', born: 1960}),
       (sandra:Person {name: 'Sandra Bullock', born: 1964}),
       (lana:Person {name: 'Lana Wachowski', born: 1965}),
       (lilly:Person {name: 'Lilly Wachowski', born: 1967}),
       (chad:Person {name: 'Chad Stahelski', born: 1968}),
       (jan:Person {name: 'Jan de Bont', born: 1943}),
       (keanu)-[:ACTED_IN {roles: ['Neo']}]->(matrix),
       (keanu)-[:ACTED_IN {roles: ['Neo']}]->(reloaded),
       (keanu)-[:ACTED_IN {roles: ['John Wick']}]->(johnWick),
       (keanu)-[:ACTED_IN {roles: ['Jack Traven']}]->(speed),
       (carrie)-[:ACTED_IN {roles: ['Trinity']}]->(matrix),
       (carrie)-[:ACTED_IN {roles: ['Trinity']}]->(reloaded),
       (laurence)-[:ACTED_IN {roles: ['Morpheus']}]->(matrix),
       (laurence)-[:ACTED_IN {roles: ['Morpheus']}]->(reloaded),
       (hugo)-[:ACTED_IN {roles: ['Agent Smith']}]->(matrix),
       (hugo)-[:ACTED_IN {roles: ['Agent Smith']}]->(reloaded),
       (sandra)-[:ACTED_IN {roles: ['Annie Porter']}]->(speed),
       (lana)-[:DIRECTED]->(matrix), (lilly)-[:DIRECTED]->(matrix),
       (lana)-[:DIRECTED]->(reloaded), (lilly)-[:DIRECTED]->(reloaded),
       (chad)-[:DIRECTED]->(johnWick), (jan)-[:DIRECTED]->(speed)
`;

/** The queries the playground offers, each with a line on what it shows. */
export const EXAMPLES: ReadonlyArray<{ label: string; cypher: string }> = [
    {
        label: 'Who acted in The Matrix?',
        cypher: `MATCH (p:Person)-[r:ACTED_IN]->(m:Movie {title: 'The Matrix'})
RETURN p.name AS actor, r.roles AS roles
ORDER BY actor`
    },
    {
        label: "Keanu's films, newest first",
        cypher: `MATCH (:Person {name: 'Keanu Reeves'})-[:ACTED_IN]->(m:Movie)
RETURN m.title AS title, m.released AS released
ORDER BY released DESC`
    },
    {
        label: 'Co-stars, counted',
        cypher: `MATCH (keanu:Person {name: 'Keanu Reeves'})-[:ACTED_IN]->(m)<-[:ACTED_IN]-(other:Person)
RETURN other.name AS costar, count(m) AS films, collect(m.title) AS titles
ORDER BY films DESC, costar`
    },
    {
        label: 'Directors and their casts',
        cypher: `MATCH (d:Person)-[:DIRECTED]->(m:Movie)
OPTIONAL MATCH (a:Person)-[:ACTED_IN]->(m)
RETURN m.title AS title, collect(DISTINCT d.name) AS directors, count(DISTINCT a) AS cast
ORDER BY title`
    },
    {
        label: 'Up to three hops from Sandra Bullock',
        cypher: `MATCH (:Person {name: 'Sandra Bullock'})-[:ACTED_IN*1..3]-(n)
RETURN DISTINCT coalesce(n.name, n.title) AS reached, labels(n) AS labels
ORDER BY reached`
    },
    {
        label: 'Add a film, then read it back',
        cypher: `MERGE (m:Movie {title: 'The Matrix Resurrections'})
SET m.released = 2021
WITH m
MATCH (keanu:Person {name: 'Keanu Reeves'})
MERGE (keanu)-[:ACTED_IN {roles: ['Neo']}]->(m)
RETURN m.title AS title, m.released AS released`
    }
];
