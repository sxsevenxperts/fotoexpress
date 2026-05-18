const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fotoexpress',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function seedTestData() {
  try {
    console.log('Starting test data seed...');

    // 1. Create a test photographer user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, 'photographer')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      ['test-photographer@fotoexpress.local', 'hashed_password_placeholder', 'Test', 'Photographer']
    );
    const photographerId = userResult.rows[0]?.id;
    console.log(`✓ Created test photographer user (ID: ${photographerId})`);

    // 2. Create photographer profile
    const photographerProfileResult = await pool.query(
      `INSERT INTO photographers (user_id, company_name, verified_status)
       VALUES ($1, 'Test Photo Studio', 'verified')
       ON CONFLICT (user_id) DO UPDATE SET company_name = EXCLUDED.company_name
       RETURNING id`,
      [photographerId]
    );
    const professionId = photographerProfileResult.rows[0]?.id;
    console.log(`✓ Created photographer profile (ID: ${professionId})`);

    // 3. Get or create an event category
    const categoryResult = await pool.query(
      `SELECT id FROM event_categories WHERE slug = 'futebol' LIMIT 1`
    );
    const categoryId = categoryResult.rows[0]?.id;
    console.log(`✓ Using event category (ID: ${categoryId})`);

    // 4. Create a test gallery
    const galleryResult = await pool.query(
      `INSERT INTO galleries (photographer_id, event_category_id, event_date, event_location, title, description, default_photo_price, is_published)
       VALUES ($1, $2, CURRENT_DATE, 'São Paulo, SP', 'Test Gallery', 'Test gallery for checkout flow', 29.90, true)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [professionId, categoryId]
    );
    const galleryId = galleryResult.rows[0]?.id;
    console.log(`✓ Created test gallery (ID: ${galleryId})`);

    // 5. Create test photos
    const photoIds = [];
    for (let i = 1; i <= 3; i++) {
      const photoResult = await pool.query(
        `INSERT INTO photos (gallery_id, file_url, thumbnail_url, width, height, price, order_index)
         VALUES ($1, $2, $3, 1920, 1080, 29.90, $4)
         RETURNING id`,
        [
          galleryId,
          `file:///test/photo-${i}.jpg`,
          `https://via.placeholder.com/200?text=Photo${i}`,
          i
        ]
      );
      photoIds.push(photoResult.rows[0]?.id);
      console.log(`✓ Created test photo ${i} (ID: ${photoResult.rows[0]?.id})`);
    }

    console.log('\nTest data seeded successfully!');
    console.log(`Gallery ID: ${galleryId}`);
    console.log(`Photo IDs: ${photoIds.join(', ')}`);
    console.log('\nYou can now use these IDs in your cart for testing.');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding test data:', error);
    process.exit(1);
  }
}

seedTestData();
