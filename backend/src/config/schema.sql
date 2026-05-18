-- FotoExpress - Schema consolidado (fonte única da verdade)
-- Modelo de negócio: fotógrafo cria álbuns por evento, sobe fotos com marca d'água,
-- gera link exclusivo do álbum; clientes escolhem e compram fotos; download em alta
-- resolução sem marca d'água; a plataforma retém 7% de comissão por foto vendida.

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  phone VARCHAR(20),
  role VARCHAR(20) DEFAULT 'customer',
  avatar_url TEXT,
  bio TEXT,
  location VARCHAR(255),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Event Categories table
CREATE TABLE IF NOT EXISTS event_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon_url TEXT,
  image_url TEXT,
  meta_keywords TEXT,
  display_order INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON event_categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON event_categories(is_active);

-- Photographers table
CREATE TABLE IF NOT EXISTS photographers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  specialties TEXT,
  rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  response_time VARCHAR(100),
  cancellation_rate DECIMAL(5,2) DEFAULT 0,
  business_registration VARCHAR(255),
  verified_status VARCHAR(20) DEFAULT 'unverified',
  total_photos INTEGER DEFAULT 0,
  total_galleries INTEGER DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  total_earnings DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photographers_user_id ON photographers(user_id);
CREATE INDEX IF NOT EXISTS idx_photographers_verified ON photographers(verified_status);
CREATE INDEX IF NOT EXISTS idx_photographers_rating ON photographers(rating DESC);

-- Photographer Specialties table
CREATE TABLE IF NOT EXISTS photographer_specialties (
  id SERIAL PRIMARY KEY,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  event_category_id INTEGER NOT NULL REFERENCES event_categories(id) ON DELETE CASCADE,
  min_price DECIMAL(10,2),
  standard_price DECIMAL(10,2),
  premium_price DECIMAL(10,2),
  availability_status VARCHAR(20) DEFAULT 'available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(photographer_id, event_category_id)
);

CREATE INDEX IF NOT EXISTS idx_specialties_photographer ON photographer_specialties(photographer_id);
CREATE INDEX IF NOT EXISTS idx_specialties_category ON photographer_specialties(event_category_id);

-- Galleries table (álbum de um evento)
CREATE TABLE IF NOT EXISTS galleries (
  id SERIAL PRIMARY KEY,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  event_category_id INTEGER NOT NULL REFERENCES event_categories(id),
  event_date DATE NOT NULL,
  event_location VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  photo_count INTEGER DEFAULT 0,
  cover_photo_url TEXT,
  default_photo_price DECIMAL(10,2),
  share_token VARCHAR(64) UNIQUE,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_galleries_photographer ON galleries(photographer_id);
CREATE INDEX IF NOT EXISTS idx_galleries_category ON galleries(event_category_id);
CREATE INDEX IF NOT EXISTS idx_galleries_event_date ON galleries(event_date);
CREATE INDEX IF NOT EXISTS idx_galleries_published ON galleries(is_published);
CREATE INDEX IF NOT EXISTS idx_galleries_share_token ON galleries(share_token);

-- Photos table
-- file_url: original em alta resolução (NUNCA exposto em endpoint público)
-- thumbnail_url: preview de baixa resolução exibido nas listagens
CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  gallery_id INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  price DECIMAL(10,2),
  order_index INTEGER DEFAULT 0,
  tags TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photos_gallery ON photos(gallery_id);
CREATE INDEX IF NOT EXISTS idx_photos_order ON photos(gallery_id, order_index);

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  gallery_id INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size INTEGER,
  duration INTEGER,
  width INTEGER,
  height INTEGER,
  price DECIMAL(10,2),
  order_index INTEGER DEFAULT 0,
  tags TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_videos_gallery ON videos(gallery_id);
CREATE INDEX IF NOT EXISTS idx_videos_order ON videos(gallery_id, order_index);

-- Events table (pedidos de evento criados por clientes)
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

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id),
  category_id INTEGER NOT NULL REFERENCES event_categories(id),
  event_date DATE NOT NULL,
  event_location VARCHAR(255),
  event_details TEXT,
  service_package VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  price DECIMAL(10,2) NOT NULL,
  booking_date DATE DEFAULT CURRENT_DATE,
  confirmed_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_photographer ON bookings(photographer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings(event_date);

-- Payments table (pagamento de bookings)
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_provider VARCHAR(50),
  transaction_id VARCHAR(255),
  receipt_url TEXT,
  installments INTEGER DEFAULT 1,
  installment_value DECIMAL(10,2),
  pix_key VARCHAR(255),
  pix_qr_code TEXT,
  error_message TEXT,
  processed_at TIMESTAMP,
  refunded_at TIMESTAMP,
  refund_amount DECIMAL(10,2),
  refund_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  photographer_id INTEGER NOT NULL REFERENCES photographers(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  photo_quality_rating INTEGER CHECK (photo_quality_rating >= 1 AND photo_quality_rating <= 5),
  reliability_rating INTEGER CHECK (reliability_rating >= 1 AND reliability_rating <= 5),
  communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  would_recommend BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_photographer ON reviews(photographer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);

-- Cart Items table (seleção de fotos antes da compra)
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  added_price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, photo_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);

-- Photographer Availability table
CREATE TABLE IF NOT EXISTS photographer_availability (
  id SERIAL PRIMARY KEY,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  is_available BOOLEAN DEFAULT true,
  booked_count INTEGER DEFAULT 0,
  capacity INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(photographer_id, event_date)
);

CREATE INDEX IF NOT EXISTS idx_availability_photographer ON photographer_availability(photographer_id);
CREATE INDEX IF NOT EXISTS idx_availability_date ON photographer_availability(event_date);

-- Password Reset Tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);

-- Photo Purchases table (compra de foto individual)
-- price: valor pago pelo cliente | commission_amount: 7% retido pela plataforma
-- photographer_payout: valor líquido do fotógrafo (price - commission_amount)
CREATE TABLE IF NOT EXISTS photo_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  price DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,4) DEFAULT 0.0700,
  commission_amount DECIMAL(10,2),
  photographer_payout DECIMAL(10,2),
  transaction_id VARCHAR(255),
  payment_id INTEGER REFERENCES payments(id),
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(user_id, photo_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_purchases_user ON photo_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_purchases_photo ON photo_purchases(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_purchases_status ON photo_purchases(status);
CREATE INDEX IF NOT EXISTS idx_photo_purchases_date ON photo_purchases(purchase_date);

-- Video Purchases table (compra de vídeo individual)
CREATE TABLE IF NOT EXISTS video_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  price DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,4) DEFAULT 0.0700,
  commission_amount DECIMAL(10,2),
  photographer_payout DECIMAL(10,2),
  transaction_id VARCHAR(255),
  payment_id INTEGER REFERENCES payments(id),
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_purchases_user ON video_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_video_purchases_video ON video_purchases(video_id);
CREATE INDEX IF NOT EXISTS idx_video_purchases_status ON video_purchases(status);
CREATE INDEX IF NOT EXISTS idx_video_purchases_date ON video_purchases(purchase_date);

-- Face Detection Metadata table (dados de reconhecimento facial do Google Cloud Vision)
CREATE TABLE IF NOT EXISTS face_detection_metadata (
  id SERIAL PRIMARY KEY,
  photo_id INTEGER UNIQUE REFERENCES photos(id) ON DELETE CASCADE,
  video_id INTEGER UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  face_count INTEGER DEFAULT 0,
  face_data JSONB,
  face_embeddings JSONB,
  confidence_score DECIMAL(5,3),
  detection_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT one_of_photo_or_video CHECK ((photo_id IS NOT NULL AND video_id IS NULL) OR (photo_id IS NULL AND video_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_face_detection_photo ON face_detection_metadata(photo_id);
CREATE INDEX IF NOT EXISTS idx_face_detection_video ON face_detection_metadata(video_id);
CREATE INDEX IF NOT EXISTS idx_face_detection_timestamp ON face_detection_metadata(detection_timestamp);

-- Face Person Matches table (pessoas identificadas entre fotos)
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

-- Insert sample event categories
INSERT INTO event_categories (name, slug, description, display_order) VALUES
('Futebol', 'futebol', 'Partidas de futebol profissional e amador', 1),
('Futsal', 'futsal', 'Jogos de futsal', 2),
('Corrida', 'corrida', 'Eventos de corrida e maratona', 3),
('Vôlei', 'volei', 'Partidas de voleibol', 4),
('Beach Tennis', 'beach-tennis', 'Torneios de beach tennis', 5),
('Festas', 'festas', 'Festas, casamentos e eventos sociais', 6),
('Basquete', 'basquete', 'Jogos de basquete', 7),
('Congresso', 'congresso', 'Congressos e conferências', 8),
('Handebol', 'handebol', 'Jogos de handebol', 9),
('Crossfit', 'crossfit', 'Competições de crossfit', 10),
('Ciclismo', 'ciclismo', 'Eventos de ciclismo', 11),
('Automotiva', 'automotiva', 'Eventos automotivos e corridas', 12),
('Tênis', 'tenis', 'Torneios de tênis', 13),
('Airsoft', 'airsoft', 'Eventos de airsoft', 14),
('Música', 'musica', 'Shows e festivais de música', 15),
('Artes Marciais', 'artes-marciais', 'Competições de artes marciais', 16)
ON CONFLICT DO NOTHING;
