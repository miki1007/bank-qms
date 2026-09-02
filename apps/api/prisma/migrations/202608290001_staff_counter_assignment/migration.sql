ALTER TABLE "staff"
ADD COLUMN "assigned_counter_id" UUID;

CREATE UNIQUE INDEX "staff_assigned_counter_id_key"
ON "staff"("assigned_counter_id");

ALTER TABLE "staff"
ADD CONSTRAINT "staff_assigned_counter_id_fkey"
FOREIGN KEY ("assigned_counter_id") REFERENCES "counters"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing development tellers receive deterministic counter ownership.
-- Production accounts remain unassigned until a manager explicitly assigns them.
UPDATE "staff" AS s
SET "assigned_counter_id" = c."id"
FROM "counters" AS c, "branches" AS b
WHERE s."branch_id" = b."id"
  AND c."branch_id" = b."id"
  AND b."code" = 'MAIN'
  AND (
    (s."username" = 'teller.one' AND c."label" = 'Counter 1') OR
    (s."username" = 'teller.two' AND c."label" = 'Counter 2') OR
    (s."username" = 'teller.three' AND c."label" = 'Counter 3') OR
    (s."username" = 'teller.four' AND c."label" = 'Counter 4')
  );
