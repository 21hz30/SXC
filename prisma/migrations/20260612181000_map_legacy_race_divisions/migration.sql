-- Convert legacy division values (open / pro / doubles / relay) to the new
-- 12-division set based on the related customer's gender:
--   open    + male → men          + female → women
--   pro     + male → men_pro      + female → women_pro
--   doubles + male → doubles_men  + female → doubles_women
--   relay   + male → mens_relay   + female → womens_relay
-- Customers with NULL gender are left untouched — their old labels still
-- humanize gracefully and they can re-pick in the new UI.

-- 1. Customer.division (comma-separated list): expand → map → dedupe → rejoin.
WITH expanded AS (
  SELECT c.id, c.gender, part, ordinality
  FROM "Customer" c,
       LATERAL unnest(string_to_array(c.division, ',')) WITH ORDINALITY AS u(part, ordinality)
  WHERE c.division IS NOT NULL AND c.gender IN ('male','female')
),
mapped AS (
  SELECT id, ordinality,
    CASE part
      WHEN 'open'    THEN CASE gender WHEN 'male' THEN 'men'         WHEN 'female' THEN 'women'         ELSE part END
      WHEN 'pro'     THEN CASE gender WHEN 'male' THEN 'men_pro'     WHEN 'female' THEN 'women_pro'     ELSE part END
      WHEN 'doubles' THEN CASE gender WHEN 'male' THEN 'doubles_men' WHEN 'female' THEN 'doubles_women' ELSE part END
      WHEN 'relay'   THEN CASE gender WHEN 'male' THEN 'mens_relay'  WHEN 'female' THEN 'womens_relay'  ELSE part END
      ELSE part
    END AS m
  FROM expanded
),
deduped AS (
  SELECT id, m, MIN(ordinality) AS ord FROM mapped GROUP BY id, m
),
joined AS (
  SELECT id, string_agg(m, ',' ORDER BY ord) AS new_div FROM deduped GROUP BY id
)
UPDATE "Customer" c
SET division = j.new_div
FROM joined j
WHERE c.id = j.id AND c.division IS DISTINCT FROM j.new_div;

-- 2. RaceResult.division (single value): map by joined customer gender.
UPDATE "RaceResult" rr
SET division = CASE rr.division
  WHEN 'open'    THEN CASE c.gender WHEN 'male' THEN 'men'         WHEN 'female' THEN 'women'         ELSE rr.division END
  WHEN 'pro'     THEN CASE c.gender WHEN 'male' THEN 'men_pro'     WHEN 'female' THEN 'women_pro'     ELSE rr.division END
  WHEN 'doubles' THEN CASE c.gender WHEN 'male' THEN 'doubles_men' WHEN 'female' THEN 'doubles_women' ELSE rr.division END
  WHEN 'relay'   THEN CASE c.gender WHEN 'male' THEN 'mens_relay'  WHEN 'female' THEN 'womens_relay'  ELSE rr.division END
  ELSE rr.division
END
FROM "Customer" c
WHERE c.id = rr."customerId"
  AND rr.division IN ('open','pro','doubles','relay')
  AND c.gender IN ('male','female');

-- 3. RaceGoal.division (single value, same logic as RaceResult).
UPDATE "RaceGoal" rg
SET division = CASE rg.division
  WHEN 'open'    THEN CASE c.gender WHEN 'male' THEN 'men'         WHEN 'female' THEN 'women'         ELSE rg.division END
  WHEN 'pro'     THEN CASE c.gender WHEN 'male' THEN 'men_pro'     WHEN 'female' THEN 'women_pro'     ELSE rg.division END
  WHEN 'doubles' THEN CASE c.gender WHEN 'male' THEN 'doubles_men' WHEN 'female' THEN 'doubles_women' ELSE rg.division END
  WHEN 'relay'   THEN CASE c.gender WHEN 'male' THEN 'mens_relay'  WHEN 'female' THEN 'womens_relay'  ELSE rg.division END
  ELSE rg.division
END
FROM "Customer" c
WHERE c.id = rg."customerId"
  AND rg.division IN ('open','pro','doubles','relay')
  AND c.gender IN ('male','female');
