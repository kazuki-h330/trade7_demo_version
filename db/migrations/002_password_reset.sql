-- One table for all emailed one-time tokens, distinguished by purpose.
ALTER TABLE email_tokens ADD COLUMN purpose text NOT NULL DEFAULT 'verify' CHECK (purpose IN ('verify', 'reset'));
CREATE INDEX email_tokens_lookup_idx ON email_tokens(code_hash) WHERE used_at IS NULL;
