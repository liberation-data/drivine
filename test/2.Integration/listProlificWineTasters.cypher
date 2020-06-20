MATCH (t:Taster)
  WHERE t.name <> "No Taster"
WITH t
MATCH (t)-[:RATES_WINE]->(w:Wine)-[:HAS_VARIETY]->(v:Variety)
WITH t, count(w) AS total, COLLECT(DISTINCT v.name) AS varieties
RETURN {taster: t.name, varieties: varieties, total: total}
  ORDER BY total DESC
