-- Migration 002: Correções do modelo de negócio
-- Idempotente: pode ser executada sobre um banco já existente.
-- - Corrige índice de photographer_specialties
-- - Adiciona tabela events
-- - Adiciona preços de foto/vídeo, link de álbum, comissão de 7%
-- - Adiciona colunas de pagamento (PIX / reembolso)
-- - Adiciona face_embeddings e face_person_matches

-- 1. Índice incorreto (coluna correta é event_category_id)
DROP INDEX IF EXISTS idx_specialties_category;
CREATE INDEX IF NOT EXISTS idx_specialties_category
  ON photographer_specialties(event_category_id);

-- 2. Tabela de eventos (pedidos criados por clientes)
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photographer_id INTEGER REFERENCES photographers(id) ON DELETE SET NULL,
  category_id INTEGER NOT NULL REFERENCES event_categories(id),
  event_date DATE NOT NULL,
  event_location VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  budget DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_photographer ON events(photographer_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- 3. Preço da foto/vídeo e link exclusivo do álbum
ALTER TABLE photos ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);
ALTER TABLE videos ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS default_photo_price DECIMAL(10,2);
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS share_token VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galleries_share_token_key'
  ) THEN
    ALTER TABLE galleries ADD CONSTRAINT galleries_share_token_key UNIQUE (share_token);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_galleries_share_token ON galleries(share_token);

-- 4. Comissão de 7% e rastreio de ganhos do fotógrafo
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS total_sales INTEGER DEFAULT 0;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(12,2) DEFAULT 0;

ALTER TABLE photo_purchases ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE photo_purchases ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,4) DEFAULT 0.0700;
ALTER TABLE photo_purchases ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2);
ALTER TABLE photo_purchases ADD COLUMN IF NOT EXISTS photographer_payout DECIMAL(10,2);
ALTER TABLE photo_purchases ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);
ALTER TABLE photo_purchases ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,4) DEFAULT 0.0700;
ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2);
ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS photographer_payout DECIMAL(10,2);
ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);
ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_photo_purchases_status ON photo_purchases(status);
CREATE INDEX IF NOT EXISTS idx_video_purchases_status ON video_purchases(status);

-- 5. Colunas de pagamento (PIX e reembolso)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pix_key VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pix_qr_code TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason TEXT;

-- 6. Reconhecimento facial
ALTER TABLE face_detection_metadata ADD COLUMN IF NOT EXISTS face_embeddings JSONB;

CREATE TABLE IF NOT EXISTS face_person_matches (
  id SERIAL PRIMARY KEY,
  source_photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  match_photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  similarity_score DECIMAL(5,3) NOT NULL,
  source_face_index INTEGER NOT NULL,
  match_face_index INTEGER NOT NULL,
  matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_photo_id, match_photo_id, source_face_index, match_face_index)
);

CREATE INDEX IF NOT EXISTS idx_face_matches_source ON face_person_matches(source_photo_id);
CREATE INDEX IF NOT EXISTS idx_face_matches_match ON face_person_matches(match_photo_id);
CREATE INDEX IF NOT EXISTS idx_face_matches_similarity ON face_person_matches(similarity_score DESC);

-- 7. cart_items por foto (modelo de venda individual)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'gallery_id'
  ) THEN
    DELETE FROM cart_items;
    ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_user_id_gallery_id_key;
    ALTER TABLE cart_items DROP COLUMN gallery_id;
    ALTER TABLE cart_items DROP COLUMN IF EXISTS quantity;
    ALTER TABLE cart_items ADD COLUMN photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE;
    ALTER TABLE cart_items ADD CONSTRAINT cart_items_user_id_photo_id_key UNIQUE (user_id, photo_id);
  END IF;
END $$;
