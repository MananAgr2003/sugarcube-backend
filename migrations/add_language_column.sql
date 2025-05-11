-- Add language column to users table for multilingual support
ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';

-- Add comment on the language column explaining its purpose
COMMENT ON COLUMN users.language IS 'User preferred language code (en for English, hi for Hindi, etc.)';

-- Create an index on the language column for faster lookups
CREATE INDEX IF NOT EXISTS users_language_idx ON users(language);

-- Update any existing users to have the default language
UPDATE users SET language = 'en' WHERE language IS NULL; 