-- Preserve every existing branch setting while enabling the new public-display
-- announcement controls for both existing and newly seeded installations.
UPDATE "branches"
SET "settings" = '{"soundEnabled": true, "announcementRepeatCount": 3}'::jsonb || "settings";
