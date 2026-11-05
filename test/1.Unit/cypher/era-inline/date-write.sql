DECLARE
    cy_params CLOB := $_cy_params;
    cy_rows JSON;
    cy_out JSON;
    cy_row JSON;
    cy_value JSON;
    cy_id NUMBER;
    cy_count NUMBER;
    cy_found BOOLEAN;
    cy_cursor SYS_REFCURSOR;
    cy_now TIMESTAMP;
    cy_saved1 JSON;
    cy_gathered1 JSON;
    cy_caller1 JSON;
    cy_saved2 JSON;
    cy_gathered2 JSON;
    cy_caller2 JSON;
    cy_saved3 JSON;
    cy_gathered3 JSON;
    cy_caller3 JSON;
BEGIN
    SELECT CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS TIMESTAMP) INTO cy_now FROM DUAL;
    SELECT COALESCE(JSON_ARRAYAGG(JSON('{}') NULL ON NULL RETURNING JSON), JSON('[]')) INTO cy_rows
    FROM (SELECT 1) one;
    SELECT JSON('[]') INTO cy_out;
    FOR cy_record IN (SELECT r1.item FROM JSON_TABLE(cy_rows, '$[*]' COLUMNS (item_no FOR ORDINALITY, item JSON PATH '$')) r1 ORDER BY r1.item_no) LOOP
        cy_row := cy_record.item;
        SELECT JSON_OBJECT('id' VALUE JSON('"w"'), 'day' VALUE JSON_SCALAR((SELECT REGEXP_REPLACE(LTRIM(TO_CHAR(sh3.v1, 'SYYYY-MM-DD')), '^-[0-9]{4}', TO_CHAR(EXTRACT(YEAR FROM sh3.v1) + 1, 'FM0000')) FROM (SELECT /*+ NO_MERGE */ ((SELECT (CAST(ADD_MONTHS(TRUNC(CAST(sh2.v1 AS DATE), 'MM'), sh2.v2) AS TIMESTAMP) + NUMTODSINTERVAL(LEAST(EXTRACT(DAY FROM sh2.v1), EXTRACT(DAY FROM LAST_DAY(ADD_MONTHS(TRUNC(CAST(sh2.v1 AS DATE), 'MM'), sh2.v2)))) - 1, 'DAY') + (sh2.v1 - CAST(TRUNC(CAST(sh2.v1 AS DATE)) AS TIMESTAMP))) FROM (SELECT /*+ NO_MERGE */ TO_TIMESTAMP(CASE WHEN ASCII(CASE WHEN JSON_VALUE(JSON('"-0044-03-15"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"-0044-03-15"'), '$') END) < 49 THEN REGEXP_REPLACE(CASE WHEN JSON_VALUE(JSON('"-0044-03-15"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"-0044-03-15"'), '$') END, '^(-[0-9]{4}|0000)', TO_CHAR(TO_NUMBER(REGEXP_SUBSTR(CASE WHEN JSON_VALUE(JSON('"-0044-03-15"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"-0044-03-15"'), '$') END, '^-?[0-9]{4}')) - 1, 'FM0000')) ELSE CASE WHEN JSON_VALUE(JSON('"-0044-03-15"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"-0044-03-15"'), '$') END END, 'SYYYY-MM-DD') AS v1, ((CASE WHEN SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, 1, 1) = '-' THEN -1 WHEN CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END IS NOT NULL THEN 1 END * (COALESCE(TO_NUMBER(REGEXP_SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, '^(-?)P((-?[0-9.]+)Y)?((-?[0-9.]+)M)?((-?[0-9.]+)W)?((-?[0-9.]+)D)?', 1, 1, NULL, 3)), 0) * 12 + COALESCE(TO_NUMBER(REGEXP_SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, '^(-?)P((-?[0-9.]+)Y)?((-?[0-9.]+)M)?((-?[0-9.]+)W)?((-?[0-9.]+)D)?', 1, 1, NULL, 5)), 0)))) AS v2) sh2) + NUMTODSINTERVAL(((CASE WHEN SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, 1, 1) = '-' THEN -1 WHEN CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END IS NOT NULL THEN 1 END * (COALESCE(TO_NUMBER(REGEXP_SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, '^(-?)P((-?[0-9.]+)Y)?((-?[0-9.]+)M)?((-?[0-9.]+)W)?((-?[0-9.]+)D)?', 1, 1, NULL, 7)), 0) * 7 + COALESCE(TO_NUMBER(REGEXP_SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, '^(-?)P((-?[0-9.]+)Y)?((-?[0-9.]+)M)?((-?[0-9.]+)W)?((-?[0-9.]+)D)?', 1, 1, NULL, 9)), 0)))), 'DAY') + NUMTODSINTERVAL(((SELECT CASE WHEN 1 = 1 THEN TRUNC(sh1.v1 / 86400) * 86400 ELSE sh1.v1 END FROM (SELECT /*+ NO_MERGE */ (CASE WHEN SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, 1, 1) = '-' THEN -1 WHEN CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END IS NOT NULL THEN 1 END * (COALESCE(TO_NUMBER(REGEXP_SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, 'T((-?[0-9.]+)H)?((-?[0-9.]+)M)?((-?[0-9.]+)S)?$', 1, 1, NULL, 2)), 0) * 3600 + COALESCE(TO_NUMBER(REGEXP_SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, 'T((-?[0-9.]+)H)?((-?[0-9.]+)M)?((-?[0-9.]+)S)?$', 1, 1, NULL, 4)), 0) * 60 + COALESCE(TO_NUMBER(REGEXP_SUBSTR(CASE WHEN JSON_VALUE(JSON('"P1D"'), '$.type()') = 'string' THEN JSON_VALUE(JSON('"P1D"'), '$') END, 'T((-?[0-9.]+)H)?((-?[0-9.]+)M)?((-?[0-9.]+)S)?$', 1, 1, NULL, 6)), 0))) AS v1) sh1)), 'SECOND')) AS v1) sh3)) NULL ON NULL RETURNING JSON) INTO cy_value
        FROM (SELECT 1) one;
        INSERT INTO g_node (labels, props, stamp) VALUES (JSON('["CyTemporal"]'), JSON_MERGEPATCH(JSON('{}'), JSON_TRANSFORM(cy_value, SET '$."__drivine.stamp"' = JSON('null')) RETURNING JSON), CASE WHEN JSON_VALUE(JSON_QUERY(cy_value, '$."__drivine.stamp"' RETURNING JSON), '$.type()') = 'string' THEN JSON_VALUE(JSON_QUERY(cy_value, '$."__drivine.stamp"' RETURNING JSON), '$') END) RETURNING nid INTO cy_id;
        SELECT JSON_TRANSFORM(cy_row, SET '$.v1' = JSON_SCALAR(cy_id)) INTO cy_row;
        SELECT JSON_TRANSFORM(cy_out, APPEND '$' = cy_row) INTO cy_out;
    END LOOP;
    cy_rows := cy_out;
    OPEN cy_cursor FOR
        SELECT JSON_SERIALIZE(COALESCE(JSON_ARRAYAGG(cy_r.result ORDER BY cy_r.cy_n NULL ON NULL RETURNING JSON), JSON('[]')) RETURNING CLOB) AS "rows:json" FROM (
            SELECT cy_q.result, ROWNUM AS cy_n FROM (
                SELECT p4.c1 AS result
                FROM (
                    SELECT COALESCE(JSON_SCALAR(CASE WHEN JSON_VALUE(n3.props, '$.day.type()') = 'double' AND JSON_VALUE(n3.props, '$.day') IN ('Nan', 'Inf', '-Inf') THEN DECODE(JSON_VALUE(n3.props, '$.day'), 'Nan', 'NaN', 'Inf', 'Infinity', '-Infinity') WHEN JSON_VALUE(n3.props, '$.day.type()') = 'double' OR (JSON_VALUE(n3.props, '$.day.type()') = 'number' AND NOT (JSON_VALUE(n3.props, '$.day.type()') = 'number' AND JSON_VALUE(n3.props, '$.day' RETURNING NUMBER) = TRUNC(JSON_VALUE(n3.props, '$.day' RETURNING NUMBER)))) THEN CASE WHEN JSON_VALUE(n3.props, '$.day' RETURNING BINARY_DOUBLE) = 0 THEN '0.0' WHEN ABS(TO_NUMBER(JSON_VALUE(n3.props, '$.day') DEFAULT NULL ON CONVERSION ERROR)) >= 0.001 AND ABS(TO_NUMBER(JSON_VALUE(n3.props, '$.day') DEFAULT NULL ON CONVERSION ERROR)) < 10000000 THEN TO_CHAR(TO_NUMBER(JSON_VALUE(n3.props, '$.day') DEFAULT NULL ON CONVERSION ERROR), 'FM9999990.0999999999999999999999') ELSE REGEXP_REPLACE(REPLACE(NVL(TO_CHAR(NULLIF(TO_NUMBER(JSON_VALUE(n3.props, '$.day') DEFAULT NULL ON CONVERSION ERROR), 0), 'FM9.9999999999999999EEEE'), REGEXP_REPLACE(JSON_VALUE(n3.props, '$.day'), '^(-?[0-9]+)E', '\1.0E')), '.E', '.0E'), 'E\+?(-?)0*([0-9])', 'E\1\2') END ELSE JSON_VALUE(n3.props, '$.day') END), JSON_SCALAR(CASE WHEN JSON_VALUE(n3.props, '$.day.type()') = 'string' THEN JSON_VALUE(n3.props, '$.day' RETURNING CLOB) END)) AS c1,
                           r2.item_no AS o1
                    FROM JSON_TABLE(cy_rows, '$[*]' COLUMNS (item_no FOR ORDINALITY, item JSON PATH '$')) r2
                    LEFT JOIN g_node n3 ON n3.nid = JSON_VALUE(r2.item, '$.v1' RETURNING NUMBER)
                ) p4
                ORDER BY p4.o1
            ) cy_q
        ) cy_r;
    DBMS_SQL.RETURN_RESULT(cy_cursor);
END;