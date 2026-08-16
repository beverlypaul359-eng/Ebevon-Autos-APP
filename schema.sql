-- ═══════════════════════════════════════════════════════════
--  EBEVON DATABASE SCHEMA
--  Run: psql -U postgres -d ebevon -f src/db/schema.sql
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ───────────────────────────────────────────────
CREATE TYPE user_role       AS ENUM ('buyer', 'seller', 'admin');
CREATE TYPE user_status     AS ENUM ('pending_otp', 'active', 'suspended', 'banned');
CREATE TYPE kyc_status      AS ENUM ('not_started', 'pending', 'approved', 'declined', 'needs_review');
CREATE TYPE otp_purpose     AS ENUM ('signup', 'login', 'password_reset', 'phone_verify', 'email_verify');
CREATE TYPE oauth_provider  AS ENUM ('google', 'facebook');
CREATE TYPE car_status      AS ENUM ('draft', 'pending_vin', 'pending_review', 'live', 'sold', 'removed');
CREATE TYPE car_condition   AS ENUM ('brand_new', 'foreign_used', 'nigerian_used');
CREATE TYPE escrow_status   AS ENUM ('created', 'funded', 'inspecting', 'confirmed', 'released', 'disputed', 'refunded');
CREATE TYPE delivery_status AS ENUM ('none', 'requested', 'dispatched', 'in_transit', 'delivered');

-- ─── USERS ───────────────────────────────────────────────
CREATE TABLE users (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             TEXT        UNIQUE,
  phone             TEXT        UNIQUE,
  first_name        TEXT        NOT NULL,
  last_name         TEXT        NOT NULL,
  password_hash     TEXT,                          -- NULL for OAuth-only users
  role              user_role   NOT NULL DEFAULT 'buyer',
  status            user_status NOT NULL DEFAULT 'pending_otp',
  email_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  phone_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  avatar_url        TEXT,
  state             TEXT,

  -- Seller extras
  dealership_name   TEXT,
  cac_number        TEXT,
  is_dealer         BOOLEAN     NOT NULL DEFAULT FALSE,

  -- KYC
  kyc_status        kyc_status  NOT NULL DEFAULT 'not_started',
  kyc_inquiry_id    TEXT,                          -- Persona inquiry ID
  kyc_approved_at   TIMESTAMPTZ,

  -- Passkeys
  passkey_registered BOOLEAN    NOT NULL DEFAULT FALSE,

  -- Timestamps
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── OTP CODES ───────────────────────────────────────────
CREATE TABLE otp_codes (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        REFERENCES users(id) ON DELETE CASCADE,
  target      TEXT        NOT NULL,   -- email or phone number
  code        TEXT        NOT NULL,
  purpose     otp_purpose NOT NULL,
  attempts    INT         NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_otp_target_purpose ON otp_codes(target, purpose);

-- ─── REFRESH TOKENS ──────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  device_info TEXT,
  ip_address  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rt_user ON refresh_tokens(user_id);

-- ─── OAUTH ACCOUNTS ──────────────────────────────────────
CREATE TABLE oauth_accounts (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      oauth_provider NOT NULL,
  provider_uid  TEXT          NOT NULL,
  access_token  TEXT,
  refresh_token TEXT,
  profile_data  JSONB,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_uid)
);

-- ─── PASSKEYS (WebAuthn / FIDO2) ─────────────────────────
CREATE TABLE passkeys (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id        TEXT        NOT NULL UNIQUE,
  public_key           TEXT        NOT NULL,
  counter              BIGINT      NOT NULL DEFAULT 0,
  device_type          TEXT,
  backed_up            BOOLEAN     NOT NULL DEFAULT FALSE,
  transports           TEXT[],
  friendly_name        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at         TIMESTAMPTZ
);
CREATE INDEX idx_passkeys_user ON passkeys(user_id);

-- ─── WEBAUTHN CHALLENGES (temp) ──────────────────────────
CREATE TABLE webauthn_challenges (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        REFERENCES users(id) ON DELETE CASCADE,
  challenge   TEXT        NOT NULL,
  type        TEXT        NOT NULL,  -- 'registration' | 'authentication'
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CAR LISTINGS ─────────────────────────────────────────
CREATE TABLE cars (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          car_status   NOT NULL DEFAULT 'draft',

  -- Identity
  brand           TEXT         NOT NULL,
  model           TEXT         NOT NULL,
  year            INT          NOT NULL,
  vin             TEXT         UNIQUE,
  condition       car_condition NOT NULL,
  body_type       TEXT,
  colour          TEXT,

  -- Specs
  fuel_type       TEXT,
  transmission    TEXT,
  engine_size     TEXT,
  mileage_km      INT,
  power_hp        INT,
  seats           INT,

  -- Pricing
  price_ngn       BIGINT       NOT NULL,
  negotiable      BOOLEAN      NOT NULL DEFAULT TRUE,
  delivery_available BOOLEAN   NOT NULL DEFAULT FALSE,

  -- Content
  description     TEXT,
  location_state  TEXT,

  -- VIN verification
  vin_verified    BOOLEAN      NOT NULL DEFAULT FALSE,
  vin_data        JSONB,       -- raw NHTSA/VIN API response
  vin_checked_at  TIMESTAMPTZ,

  -- Health
  health_score    INT          NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  health_engine   TEXT,
  health_transmission TEXT,
  health_exterior TEXT,
  health_interior TEXT,
  health_brakes   TEXT,
  health_tyres    TEXT,

  -- Media
  photos          TEXT[],      -- array of URLs
  video_exterior  TEXT,
  video_interior  TEXT,
  video_startup   TEXT,

  -- Stats
  view_count      INT          NOT NULL DEFAULT 0,
  published_at    TIMESTAMPTZ,
  sold_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cars_seller   ON cars(seller_id);
CREATE INDEX idx_cars_status   ON cars(status);
CREATE INDEX idx_cars_brand    ON cars(brand);
CREATE INDEX idx_cars_price    ON cars(price_ngn);

-- ─── ESCROW TRANSACTIONS ──────────────────────────────────
CREATE TABLE escrow_transactions (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  car_id              UUID          NOT NULL REFERENCES cars(id),
  buyer_id            UUID          NOT NULL REFERENCES users(id),
  seller_id           UUID          NOT NULL REFERENCES users(id),
  amount_ngn          BIGINT        NOT NULL,
  platform_fee_ngn    BIGINT        NOT NULL,   -- 5%
  seller_payout_ngn   BIGINT        NOT NULL,
  status              escrow_status NOT NULL DEFAULT 'created',
  delivery_status     delivery_status NOT NULL DEFAULT 'none',

  -- Payment (Stripe)
  stripe_payment_intent_id  TEXT,
  stripe_transfer_id        TEXT,

  -- Delivery
  delivery_address    TEXT,
  delivery_phone      TEXT,
  delivery_requested_at TIMESTAMPTZ,
  delivery_eta        DATE,

  -- Confirmation
  confirmed_at        TIMESTAMPTZ,
  released_at         TIMESTAMPTZ,
  dispute_reason      TEXT,
  disputed_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_escrow_buyer  ON escrow_transactions(buyer_id);
CREATE INDEX idx_escrow_seller ON escrow_transactions(seller_id);
CREATE INDEX idx_escrow_car    ON escrow_transactions(car_id);

-- ─── INSPECTION REQUESTS ─────────────────────────────────
CREATE TYPE inspection_status AS ENUM ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled');

CREATE TABLE inspection_requests (
  id                  UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  car_id              UUID              NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  requester_id        UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  escrow_id           UUID              REFERENCES escrow_transactions(id) ON DELETE SET NULL,

  status              inspection_status NOT NULL DEFAULT 'pending',

  -- Contact & location
  contact_name        TEXT              NOT NULL,
  contact_phone       TEXT              NOT NULL,
  preferred_date_1    DATE,
  preferred_date_2    DATE,
  inspection_address  TEXT,             -- where to inspect (seller location or buyer-specified)
  inspection_state    TEXT,

  -- Notes
  buyer_notes         TEXT,             -- special concerns, what to check
  inspector_notes     TEXT,             -- filled after inspection
  inspector_name      TEXT,

  -- Outcome
  report_url          TEXT,             -- PDF or link to inspection report
  overall_grade       TEXT,             -- A / B / C / D / F
  passed              BOOLEAN,
  scheduled_at        TIMESTAMPTZ,
  inspected_at        TIMESTAMPTZ,

  -- Admin / internal
  assigned_to         UUID              REFERENCES users(id),
  admin_notes         TEXT,
  fee_ngn             BIGINT            NOT NULL DEFAULT 10000, -- ₦10,000 flat inspection fee

  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_insp_car       ON inspection_requests(car_id);
CREATE INDEX idx_insp_requester ON inspection_requests(requester_id);
CREATE INDEX idx_insp_status    ON inspection_requests(status);

CREATE TRIGGER trg_insp_updated_at BEFORE UPDATE ON inspection_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── SAVED CARS ───────────────────────────────────────────
CREATE TABLE saved_cars (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  car_id     UUID NOT NULL REFERENCES cars(id)  ON DELETE CASCADE,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, car_id)
);

-- ─── NOTIFICATIONS ────────────────────────────────────────
CREATE TABLE notifications (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT LOG ────────────────────────────────────────────
CREATE TABLE audit_log (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        REFERENCES users(id),
  action     TEXT        NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  meta       JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUTO-UPDATE updated_at ───────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at  BEFORE UPDATE ON users  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cars_updated_at   BEFORE UPDATE ON cars   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_escrow_updated_at BEFORE UPDATE ON escrow_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
