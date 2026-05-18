-- AI Stories feature: slideshow video generation from purchased photos
CREATE TABLE stories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gallery_id INTEGER REFERENCES galleries(id) ON DELETE SET NULL,
  title VARCHAR(255),
  description TEXT,
  cover_image_url VARCHAR(1024),
  video_url VARCHAR(1024),
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, generating, completed, failed
  error_message TEXT,

  -- Story configuration
  music_url VARCHAR(1024),
  transition_type VARCHAR(50) DEFAULT 'fade', -- fade, slide, zoom
  duration_per_photo DECIMAL(4,2) DEFAULT 3.0, -- seconds
  total_duration_seconds DECIMAL(8,2),

  -- Photo references (JSON array of photo_ids that are included)
  photo_ids JSONB NOT NULL,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  -- File size for bandwidth tracking
  file_size_mb DECIMAL(10,2)
);

CREATE INDEX idx_stories_user_id ON stories(user_id);
CREATE INDEX idx_stories_gallery_id ON stories(gallery_id);
CREATE INDEX idx_stories_status ON stories(status);
CREATE INDEX idx_stories_created_at ON stories(created_at);

-- Job queue for async story generation
CREATE TABLE story_generation_jobs (
  id SERIAL PRIMARY KEY,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
  progress DECIMAL(5,2) DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_story_jobs_story_id ON story_generation_jobs(story_id);
CREATE INDEX idx_story_jobs_status ON story_generation_jobs(status);
