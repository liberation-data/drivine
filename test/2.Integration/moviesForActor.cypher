MATCH (actor:Person {name: $1})-[:ACTED_IN]->(movies)
WITH actor, collect(properties(movies)) AS moviesList
RETURN {
         actor:  {name: actor.name, born: actor.born},
         movies: moviesList
       }
