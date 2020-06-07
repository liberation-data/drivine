/* With Neo4j, you can write the movies for actor query more efficiently, as follows */

MATCH (actor:Person {name: $1})
WITH actor, [(actor)-[:ACTED_IN]-(movie:Movie) | movie {.title, .tagline, .released}] as movies
RETURN {
         actor:  actor,
         movies: movies
       }
