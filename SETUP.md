# Setup Guide - FotoExpress Development

## Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 12
- Redis (optional, for caching)

## Backend Setup

### 1. Configure Database
```bash
# Create PostgreSQL database
createdb fotoexpress

# Run schema migrations
psql fotoexpress < backend/src/config/schema.sql
```

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env` and update values:
```bash
cp .env.example .env
```

### 4. Start Backend Server
```bash
npm run dev
```

Backend will run on `http://localhost:5000`

## Frontend Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Frontend Dev Server
```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

## Running Both Services

From root directory:
```bash
npm run dev
```

This starts both backend and frontend concurrently.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login

### Photographers
- `GET /api/photographers` - List all photographers
- `GET /api/photographers/:id` - Get photographer details
- `POST /api/photographers` - Create photographer profile (authenticated)
- `PUT /api/photographers/:id` - Update photographer profile (authenticated)

### Events & Categories
- `GET /api/events/categories` - List all event categories
- `GET /api/events/categories/:id` - Get category details
- `GET /api/events/categories/:id/photographers` - Get photographers for category

### Galleries
- `GET /api/galleries` - List galleries
- `GET /api/galleries/:id` - Get gallery with photos
- `POST /api/galleries` - Create gallery (authenticated)

### Bookings
- `GET /api/bookings` - List user's bookings (authenticated)
- `GET /api/bookings/:id` - Get booking details
- `POST /api/bookings` - Create booking (authenticated)
- `PUT /api/bookings/:id/status` - Update booking status

### Payments
- `GET /api/payments/booking/:booking_id` - Get payment info
- `POST /api/payments/pix` - Create PIX payment
- `POST /api/payments/credit-card` - Create credit card payment
- `PUT /api/payments/:id/confirm` - Confirm payment

## Database Schema

### Tables
- `users` - User accounts with profiles
- `photographers` - Photographer profiles with ratings
- `event_categories` - Photography event types
- `photographer_specialties` - Specialties and pricing per category
- `galleries` - Photographer photo collections
- `photos` - Individual photos in galleries
- `bookings` - Photography session bookings
- `payments` - Payment transactions
- `reviews` - User reviews of photographers

## Development Workflow

1. Create feature branch: `git checkout -b feature/feature-name`
2. Make changes and commit: `git commit -m "feat: description"`
3. Push to GitHub: `git push -u origin feature/feature-name`
4. Create Pull Request on GitHub

## Troubleshooting

### Database Connection Error
- Ensure PostgreSQL is running
- Verify database credentials in `.env`
- Check database exists: `psql -l | grep fotoexpress`

### Port Already in Use
- Backend: Change PORT in `.env`
- Frontend: Modify Vite config for different port

### Module Not Found
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. Set up authentication system with password reset
2. Implement image upload to AWS S3
3. Add payment processing (Stripe/PagSeguro)
4. Integrate facial recognition for photo tagging
5. Build photographer dashboard
6. Add review and rating system
7. Implement search and filtering
8. Add mobile app (React Native)
