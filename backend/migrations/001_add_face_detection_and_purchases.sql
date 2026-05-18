-- Migration: Add Face Detection and Purchase Tracking Tables
-- This migration adds support for facial recognition and individual photo/video purchases

-- Add videos table if not exists
CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  gallery_id INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size INTEGER,
  duration INTEGER,
  width INTEGER,
  height INTEGER,
  order_index INTEGER DEFAULT 0,
  tags TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_videos_gallery ON videos(gallery_id);
CREATE INDEX IF NOT EXISTS idx_videos_order ON videos(gallery_id, order_index);

-- Add photo_purchases table for tracking individual photo purchases
CREATE TABLE IF NOT EXISTS photo_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  price DECIMAL(10,2) NOT NULL,
  payment_id INTEGER REFERENCES payments(id),
  UNIQUE(user_id, photo_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_purchases_user ON photo_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_purchases_photo ON photo_purchases(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_purchases_date ON photo_purchases(purchase_date);

-- Add video_purchases table for tracking individual video purchases
CREATE TABLE IF NOT EXISTS video_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  price DECIMAL(10,2) NOT NULL,
  payment_id INTEGER REFERENCES payments(id),
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_purchases_user ON video_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_video_purchases_video ON video_purchases(video_id);
CREATE INDEX IF NOT EXISTS idx_video_purchases_date ON video_purchases(purchase_date);

-- Add face_detection_metadata table for storing facial recognition data from Google Cloud Vision
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

-- Add face_person_matches table for storing identified people across photos
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
