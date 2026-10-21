-- US-AI-07 (ADR-018): a cooperative can use a hosted OpenAI-compatible provider with its own API key.
ALTER TABLE "AssistantSetting" ALTER COLUMN "model" DROP NOT NULL;
ALTER TABLE "AssistantSetting" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "AssistantSetting" ADD COLUMN "hostedProvider" TEXT;
ALTER TABLE "AssistantSetting" ADD COLUMN "hostedModel" TEXT;
ALTER TABLE "AssistantSetting" ADD COLUMN "apiKeyCiphertext" TEXT;
ALTER TABLE "AssistantSetting" ADD COLUMN "apiKeyIv" TEXT;
ALTER TABLE "AssistantSetting" ADD COLUMN "apiKeyTag" TEXT;
ALTER TABLE "AssistantSetting" ADD COLUMN "apiKeyHint" TEXT;
