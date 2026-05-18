-- Affiliate Program - Referral codes and commission tracking
-- Allows photographers to generate referral codes and earn commissions
-- when new customers sign up using their codes and make purchases

-- Referral Codes table
CREATE TABLE IF NOT EXISTS referral_codes (
  id SERIAL PRIMARY KEY,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  code VARCHAR(32) UNIQUE NOT NULL,
  commission_rate DECIMAL(5,4) DEFAULT 0.1000,
  is_active BOOLEAN DEFAULT true,
  uses_count INTEGER DEFAULT 0,
  max_uses INTEGER,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_photographer ON referral_codes(photographer_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_active ON referral_codes(is_active);

-- Affiliate Referrals table - tracks which customers came from which referral code
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id SERIAL PRIMARY KEY,
  referral_code_id INTEGER NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(referral_code_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_code ON affiliate_referrals(referral_code_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_photographer ON affiliate_referrals(photographer_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_customer ON affiliate_referrals(customer_id);

-- Affiliate Commissions table - tracks earnings from referral-based purchases
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id SERIAL PRIMARY KEY,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  referral_code_id INTEGER REFERENCES referral_codes(id) ON DELETE SET NULL,
  photo_purchase_id INTEGER REFERENCES photo_purchases(id) ON DELETE SET NULL,
  video_purchase_id INTEGER REFERENCES video_purchases(id) ON DELETE SET NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT one_purchase CHECK ((photo_purchase_id IS NOT NULL AND video_purchase_id IS NULL) OR (photo_purchase_id IS NULL AND video_purchase_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_photographer ON affiliate_commissions(photographer_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_code ON affiliate_commissions(referral_code_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON affiliate_commissions(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_date ON affiliate_commissions(created_at);
