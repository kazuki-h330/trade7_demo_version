-- trade7 initial schema (PostgreSQL 15+ / PGlite)
-- Money is stored as integer yen. Rates are stored as tenths of a percent (88.5% = 885).

CREATE TABLE users (
  id                text PRIMARY KEY,
  email             text NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  name              text NOT NULL,
  kana              text NOT NULL,
  role              text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  email_verified_at timestamptz,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'warned', 'restricted', 'frozen', 'expelled')),
  kyc_status        text NOT NULL DEFAULT 'none' CHECK (kyc_status IN ('none', 'pending', 'approved', 'rejected')),
  seller_status     text NOT NULL DEFAULT 'none' CHECK (seller_status IN ('none', 'pending', 'approved', 'rejected')),
  seller_applied_at timestamptz,
  seller_note       text,
  charge_balance    integer NOT NULL DEFAULT 0 CHECK (charge_balance >= 0),
  sales_balance     integer NOT NULL DEFAULT 0 CHECK (sales_balance >= 0),
  flag_invalid      integer NOT NULL DEFAULT 0,
  flag_dup          integer NOT NULL DEFAULT 0,
  flag_blocked      integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         text PRIMARY KEY, -- sha256 of the cookie token
  user_id    text NOT NULL REFERENCES users(id),
  ip         text NOT NULL,
  ua         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE email_tokens (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id),
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE files (
  id         text PRIMARY KEY,
  owner_id   text NOT NULL REFERENCES users(id),
  kind       text NOT NULL CHECK (kind IN ('kyc', 'screenshot')),
  trade_id   text,
  path       text NOT NULL,
  mime       text NOT NULL,
  size       integer NOT NULL,
  sha256     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kyc_submissions (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id),
  doc_type     text NOT NULL,
  file_id      text NOT NULL REFERENCES files(id),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewer_id  text REFERENCES users(id),
  note         text
);
CREATE INDEX kyc_user_idx ON kyc_submissions(user_id);

CREATE TABLE bank_accounts (
  user_id        text PRIMARY KEY REFERENCES users(id),
  bank_name      text NOT NULL,
  branch         text NOT NULL,
  account_type   text NOT NULL,
  account_number text NOT NULL,
  holder         text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id             text PRIMARY KEY,
  seller_id      text NOT NULL REFERENCES users(id),
  brand          text NOT NULL DEFAULT 'apple',
  face           integer NOT NULL CHECK (face > 0),
  rate_x10       integer NOT NULL CHECK (rate_x10 > 0 AND rate_x10 <= 1000),
  price          integer NOT NULL CHECK (price > 0),
  code_ct        text NOT NULL,
  code_iv        text NOT NULL,
  code_tag       text NOT NULL,
  key_version    integer NOT NULL,
  code_head      text NOT NULL,
  code_tail      text NOT NULL,
  code_fp        text NOT NULL UNIQUE, -- HMAC fingerprint: the same code can never be listed twice
  status         text NOT NULL DEFAULT 'checking' CHECK (status IN ('checking', 'active', 'sold', 'rejected', 'withdrawn', 'cancelled')),
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  sold_at        timestamptz,
  check_result   text CHECK (check_result IN ('ok', 'ng')),
  check_balance  integer,
  check_method   text,
  check_note     text,
  check_at       timestamptz,
  check_staff_id text REFERENCES users(id)
);
CREATE INDEX listings_status_idx ON listings(status);
CREATE INDEX listings_seller_idx ON listings(seller_id);

CREATE TABLE payouts (
  id         text PRIMARY KEY,
  status     text NOT NULL DEFAULT 'exported' CHECK (status IN ('exported', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES users(id),
  paid_at    timestamptz,
  paid_by    text REFERENCES users(id)
);

CREATE TABLE payout_items (
  payout_id   text NOT NULL REFERENCES payouts(id),
  seller_id   text NOT NULL REFERENCES users(id),
  amount      integer NOT NULL,
  trade_count integer NOT NULL,
  bank        jsonb NOT NULL,
  PRIMARY KEY (payout_id, seller_id)
);

CREATE TABLE trades (
  id           text PRIMARY KEY,
  listing_id   text NOT NULL UNIQUE REFERENCES listings(id), -- second line of defence against double sale
  buyer_id     text NOT NULL REFERENCES users(id),
  seller_id    text NOT NULL REFERENCES users(id),
  face         integer NOT NULL,
  rate_x10     integer NOT NULL,
  price        integer NOT NULL,
  fee          integer NOT NULL,
  seller_net   integer NOT NULL,
  status       text NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'completed', 'disputed', 'cancelled')),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  deadline     timestamptz NOT NULL,
  completed_at timestamptz,
  completed_by text CHECK (completed_by IN ('buyer', 'auto', 'admin')),
  payout_id    text REFERENCES payouts(id)
);
CREATE INDEX trades_buyer_idx ON trades(buyer_id);
CREATE INDEX trades_seller_idx ON trades(seller_id);
CREATE INDEX trades_due_idx ON trades(deadline) WHERE status = 'awaiting';

CREATE TABLE disputes (
  trade_id    text PRIMARY KEY REFERENCES trades(id),
  reason      text NOT NULL,
  detail      text,
  opened_at   timestamptz NOT NULL DEFAULT now(),
  resolution  text,
  resolved_at timestamptz,
  resolved_by text REFERENCES users(id)
);

CREATE TABLE dispute_messages (
  id         text PRIMARY KEY,
  trade_id   text NOT NULL REFERENCES trades(id),
  user_id    text NOT NULL REFERENCES users(id),
  role       text NOT NULL CHECK (role IN ('buyer', 'seller', 'admin')),
  body       text NOT NULL,
  flagged    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispute_messages_trade_idx ON dispute_messages(trade_id);

CREATE TABLE detections (
  id          text PRIMARY KEY,
  trade_id    text NOT NULL REFERENCES trades(id),
  user_id     text NOT NULL REFERENCES users(id),
  body        text NOT NULL,
  rule_hits   jsonb NOT NULL DEFAULT '[]',
  ai          jsonb,
  action      text NOT NULL CHECK (action IN ('block', 'flag')),
  reviewed_at timestamptz,
  reviewed_by text REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE charges (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id),
  amount      integer NOT NULL CHECK (amount > 0),
  received    integer,
  payer_name  text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_id text REFERENCES users(id),
  note        text
);

CREATE TABLE ledger (
  id            serial PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id),
  account       text NOT NULL CHECK (account IN ('charge', 'sales')),
  delta         integer NOT NULL,
  balance_after integer NOT NULL,
  kind          text NOT NULL,
  ref           text NOT NULL,
  note          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_user_idx ON ledger(user_id, id DESC);

CREATE TABLE sanctions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id),
  level      text NOT NULL,
  reason     text NOT NULL,
  by_id      text REFERENCES users(id), -- NULL = automatic
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  seq        serial PRIMARY KEY,
  at         timestamptz NOT NULL,
  actor_id   text NOT NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action     text NOT NULL,
  target     text NOT NULL DEFAULT '',
  detail     text NOT NULL DEFAULT '',
  ip         text NOT NULL,
  ua         text NOT NULL,
  prev_hash  text NOT NULL,
  hash       text NOT NULL
);
CREATE INDEX audit_target_idx ON audit_logs(target);
CREATE INDEX audit_actor_idx ON audit_logs(actor_id);

-- Audit log is append-only at the database level.
CREATE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END
$$;
CREATE TRIGGER audit_logs_no_modify BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TABLE emails (
  id         text PRIMARY KEY,
  user_id    text REFERENCES users(id),
  to_addr    text NOT NULL,
  event      text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  status     text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'logged', 'failed')),
  error      text,
  attempts   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz,
  read_at    timestamptz
);
CREATE INDEX emails_user_idx ON emails(user_id);
CREATE INDEX emails_queue_idx ON emails(created_at) WHERE status = 'queued';

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
