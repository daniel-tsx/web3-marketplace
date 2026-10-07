CREATE TABLE users (id TEXT PRIMARY KEY, created_at BIGINT NOT NULL);

CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ecosystem TEXT NOT NULL CHECK (ecosystem IN ('evm', 'solana', 'sui')),
  address TEXT COLLATE "C" NOT NULL,
  created_at BIGINT NOT NULL,
  verified_at BIGINT NOT NULL,
  UNIQUE (ecosystem, address)
);
CREATE INDEX wallets_user_idx ON wallets(user_id);

CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  ecosystem TEXT NOT NULL CHECK (ecosystem IN ('evm', 'solana', 'sui')),
  address TEXT COLLATE "C" NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'link-wallet')),
  user_id TEXT REFERENCES users(id),
  message TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT
);
CREATE INDEX challenges_expiry_idx ON auth_challenges(expires_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE wallet_link_requests (
  challenge_id TEXT PRIMARY KEY REFERENCES auth_challenges(id),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  authorizer_ecosystem TEXT NOT NULL CHECK (authorizer_ecosystem IN ('evm', 'solana', 'sui')),
  authorizer_address TEXT COLLATE "C" NOT NULL,
  authorization_message TEXT NOT NULL
);
CREATE INDEX wallet_link_sessions_idx ON wallet_link_requests(session_id);
