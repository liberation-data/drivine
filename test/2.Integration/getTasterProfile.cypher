MATCH (t:Taster)
  WHERE t.name = $name
WITH t
MATCH (t)-[:RATES_WINE]->(w:Wine)-[:HAS_VARIETY]->(v:Variety)
WITH t.name as taster, count(w) AS total, COLLECT(DISTINCT v.name) AS varieties ORDER BY total DESC
RETURN {taster: taster, varieties: varieties, total: total}

