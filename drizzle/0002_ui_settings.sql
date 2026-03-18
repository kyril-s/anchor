ALTER TABLE "app_config"
ADD COLUMN "ui_settings_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
