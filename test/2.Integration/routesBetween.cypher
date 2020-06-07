MATCH paths = (a:Metro {name: $1})-[:HAS_ROUTE*1..6]-(b:Metro {name: $2})
WITH paths, relationships(paths) AS rels
UNWIND rels AS rel
WITH sum(rel.travelTime) AS travel_time, paths, nodes(paths) AS nodes
UNWIND nodes(paths) AS node
WITH paths, collect(node.name) AS metros, travel_time
WITH $1 AS origin, $2 AS destination, metros, travel_time
  ORDER BY travel_time
RETURN {origin: origin, destination: destination, metros: metros, travel_time: travel_time}
