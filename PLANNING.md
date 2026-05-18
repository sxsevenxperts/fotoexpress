# FotoExpress - Detailed Planning & Architecture Document

**Date:** May 14, 2026  
**Version:** 1.0  
**Status:** Planning Phase  
**Objective:** Replicate Fotto.com.br features with high performance

---

## Executive Summary

FotoExpress is a photography marketplace platform connecting event photographers with customers. The platform allows users to:
- Search and browse photos from events they participated in
- Discover and book photographers
- Manage photo galleries and bookings
- Process payments securely
- Leave reviews and ratings

---

## 1. User Personas & User Flows

### 1.1 User Types

#### Customer
- Searches for photos from events they attended
- Books photographers for future events
- Manages purchases and gallery access
- Leaves reviews for photographers

#### Photographer
- Creates portfolio with galleries
- Lists availability for event categories
- Manages bookings and event schedules
- Sets pricing for different event types
- Views analytics and earnings

#### Admin
- Manages event categories
- Moderates user content
- Views platform analytics
- Manages payments and disputes

### 1.2 Critical User Flows

**Customer Search Flow:**
Home → Category Selection → Event Filter → Photo Results → Photo Detail → Booking/Purchase → Payment → Order Confirmation

**Photographer Onboarding Flow:**
Register → Profile Setup → Portfolio Upload → Category Selection → Pricing Setup → Availability Calendar → Go Live

**Photo Discovery:**
Search Bar → Category → Filter by Date/Photographer/Price → Results Grid → Detail View → Add to Cart → Checkout

---

## 2. Feature Breakdown

### 2.1 Core Features (MVP)

#### Home Page
- Hero section with event photo background
- Search bar with autocomplete for events/locations
- Featured categories grid (16 categories visible on Fotto)
- Recent/trending photos carousel
- Call-to-action sections for both customers and photographers

#### Categories & Discovery
- 16+ event categories:
  - Sports: Futebol, Futsal, Corrida, Vôlei, Tennis, Beach Tennis, Basquete, Handball, Airsport, Cycling, Motorsport, MMA
  - Social: Festas, Congresso, Música, Artes Marciais
- Subcategories for each main category
- Filter by date range, photographer rating, price range
- Sorting: Relevance, Newest, Price (Low to High, High to Low), Rating

#### Photographer Directory
- Grid view of photographers
- Photographer cards showing:
  - Profile photo
  - Name and specialty
  - Rating and review count
  - Number of photos available
  - "View Portfolio" button
- Photographer detail page with:
  - Full portfolio with photo grid
  - Pricing for each event category
  - Calendar availability
  - Reviews and ratings
  - "Book Now" button

#### Photo Gallery & Search
- Infinite scroll or pagination for photo results
- Photo preview cards with:
  - Thumbnail image
  - Event name and date
  - Photographer name
  - Price
  - Rating
- Lightbox/modal for full photo viewing
- Photo detail page showing:
  - Full resolution image
  - Event metadata
  - Photographer info
  - Price and purchase options
  - Related photos

#### Booking System
- Date/time selection interface
- Service package selection
- Event details input form
- Booking confirmation
- Booking history and management

#### Payment Processing
- Multiple payment methods:
  - Credit/Debit Card (Stripe)
  - PIX (Brazilian instant transfer)
  - Installment options
- Secure payment gateway integration
- Order confirmation and receipt
- Refund policies

#### User Accounts
- Registration (customer/photographer selection)
- Profile management
- My Photos/Purchases section
- Booking history
- Address and payment method management

#### Reviews & Ratings
- 5-star rating system
- Written reviews
- Photo quality ratings
- Photographer reliability ratings
- Review moderation

#### Photographer Dashboard
- Analytics dashboard
- Gallery management
- Booking management
- Calendar/availability
- Earnings and payment history
- Customer reviews section

---

## 3. Database Schema (Refined)

### Core Tables

**users**
- id, email, password_hash, first_name, last_name, phone
- role (customer/photographer), avatar_url, bio
- created_at, updated_at

**photographers**
- id, user_id, company_name, specialties, rating
- total_reviews, response_time, cancellation_rate
- business_registration, verified_status

**event_categories**
- id, name, slug, description, icon_url, image_url
- meta_keywords

**photographer_specialties**
- id, photographer_id, category_id
- min_price, standard_price, premium_price
- availability_status

**galleries**
- id, photographer_id, event_category_id, event_date
- title, description, photo_count, cover_photo_url
- published_at

**photos**
- id, gallery_id, file_url, thumbnail_url
- uploaded_at, order_index

**bookings**
- id, customer_id, photographer_id, category_id
- event_date, event_location, event_details
- status (pending/confirmed/completed/cancelled)
- price, booking_date, created_at

**payments**
- id, booking_id, customer_id, amount
- status (pending/completed/failed/refunded)
- payment_method (card/pix/installment)
- transaction_id, receipt_url, created_at

**reviews**
- id, booking_id, reviewer_id, photographer_id
- rating (1-5), comment, photo_quality_rating
- reliability_rating, created_at

**cart_items** (new)
- id, user_id, gallery_id, created_at

**photographer_availability** (new)
- id, photographer_id, event_date
- is_available, booked_count, capacity

---

## 4. Frontend Architecture

### Components Structure

```
src/
├── components/
│   ├── Navigation.tsx          (Header with search, user menu)
│   ├── Footer.tsx              (Footer with links)
│   ├── PhotoCard.tsx           (Photo grid item)
│   ├── PhotographerCard.tsx    (Photographer profile card)
│   ├── CategoryCard.tsx        (Category grid item)
│   ├── SearchBar.tsx           (Autocomplete search)
│   ├── FilterPanel.tsx         (Category/price/date filters)
│   ├── RatingStars.tsx         (Star display component)
│   ├── Pagination.tsx          (Page navigation)
│   └── Modal/
│       ├── PhotoLightbox.tsx   (Full photo viewer)
│       └── BookingModal.tsx    (Booking dialog)
│
├── pages/
│   ├── HomePage.tsx            (Landing page with hero)
│   ├── CategoriesPage.tsx      (Category grid view)
│   ├── SearchResultsPage.tsx   (Photo search results)
│   ├── PhotographersPage.tsx   (Photographer directory)
│   ├── PhotographerDetailPage.tsx (Portfolio & booking)
│   ├── PhotoDetailPage.tsx     (Individual photo view)
│   ├── BookingPage.tsx         (Booking creation)
│   ├── CartPage.tsx            (Shopping cart)
│   ├── CheckoutPage.tsx        (Payment page)
│   ├── MyPhotosPage.tsx        (Customer purchases)
│   ├── BookingsPage.tsx        (Booking history)
│   ├── LoginPage.tsx           (Authentication)
│   ├── RegisterPage.tsx        (User registration)
│   ├── ProfilePage.tsx         (User profile)
│   └── DashboardPage.tsx       (Photographer dashboard)
│
├── hooks/
│   ├── useAuth.ts
│   ├── useFetch.ts
│   ├── useFilters.ts
│   └── useCart.ts
│
├── services/
│   ├── api.ts                  (API client)
│   ├── auth.ts                 (Auth logic)
│   └── payment.ts              (Payment integration)
│
├── context/
│   ├── AuthContext.tsx
│   └── CartContext.tsx
│
├── types/
│   └── index.ts                (TypeScript types)
│
└── App.tsx, main.tsx, index.css
```

### Key Pages & Functionality

**HomePage**
- Hero section with featured event photo
- Search bar with event autocomplete
- Category showcase grid (16 categories)
- "Latest uploads" carousel
- Call-to-action sections
- Statistics (total photographers, photos, bookings)

**SearchResultsPage**
- Filter panel (categories, date range, price, rating)
- Results grid with infinite scroll
- Sort options
- Result count and pagination
- Breadcrumb navigation

**PhotographerDetailPage**
- Profile header with photo, name, rating
- Bio and specialties
- Portfolio gallery grid
- Pricing table per category
- Availability calendar
- Customer reviews section
- "Book Now" CTA button

**BookingPage**
- Event category selection
- Date/time picker
- Event location and details
- Service package selection
- Price summary
- Photographer confirmation

**DashboardPage**
- Analytics cards (earnings, bookings, ratings)
- Booking management table
- Gallery management section
- Calendar view for availability
- Recent reviews list

---

## 5. Backend API Architecture

### Authentication & Security
- JWT tokens with 7-day expiration
- Refresh token rotation
- Role-based access control (RBAC)
- Password hashing with bcryptjs
- CORS enabled for frontend domain
- Rate limiting on sensitive endpoints

### API Endpoints (Organized by Resource)

#### Authentication
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh-token
POST   /api/auth/logout
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
```

#### Users
```
GET    /api/users/profile
PUT    /api/users/profile
GET    /api/users/:id/public
PUT    /api/users/settings
GET    /api/users/notifications
```

#### Photographers
```
GET    /api/photographers                    (list with filters)
GET    /api/photographers/:id                (profile detail)
POST   /api/photographers                    (create/register)
PUT    /api/photographers/:id                (update profile)
GET    /api/photographers/:id/galleries
GET    /api/photographers/:id/reviews
GET    /api/photographers/:id/availability
PUT    /api/photographers/:id/availability
```

#### Categories
```
GET    /api/categories                       (all categories)
GET    /api/categories/:id
GET    /api/categories/:id/photographers     (by category)
GET    /api/categories/:id/trending-photos
```

#### Galleries
```
GET    /api/galleries                        (search/filter)
GET    /api/galleries/:id                    (with photos)
POST   /api/galleries                        (create)
PUT    /api/galleries/:id                    (update)
DELETE /api/galleries/:id
POST   /api/galleries/:id/photos             (upload)
DELETE /api/galleries/:id/photos/:photo_id
```

#### Photos
```
GET    /api/photos/:id
GET    /api/photos/search                    (search across all)
GET    /api/photos/trending
GET    /api/photos/recent
```

#### Bookings
```
GET    /api/bookings                         (user's bookings)
GET    /api/bookings/:id
POST   /api/bookings                         (create)
PUT    /api/bookings/:id/status              (update status)
DELETE /api/bookings/:id                     (cancel)
```

#### Payments
```
GET    /api/payments/booking/:booking_id
POST   /api/payments/card                    (credit card)
POST   /api/payments/pix                     (PIX instant transfer)
POST   /api/payments/:id/confirm
GET    /api/payments/:id/receipt
POST   /api/payments/:id/refund
```

#### Reviews
```
GET    /api/reviews/photographer/:id
POST   /api/reviews                          (create)
PUT    /api/reviews/:id                      (update)
DELETE /api/reviews/:id
```

#### Cart
```
GET    /api/cart
POST   /api/cart/add
DELETE /api/cart/remove/:item_id
PUT    /api/cart/update
```

#### Search
```
GET    /api/search                           (unified search)
GET    /api/search/autocomplete              (event names)
GET    /api/search/suggestions
```

---

## 6. Performance Optimizations

### Frontend
- Code splitting with React.lazy() for pages
- Image lazy loading for photo grids
- Infinite scroll pagination instead of all-at-once loading
- LocalStorage for cart and filters
- Debounced search/filter inputs
- Memoized components (React.memo) for photo cards
- CSS-in-JS or Tailwind for optimized styling
- Service Worker for offline support
- Image optimization (WebP, responsive sizes)

### Backend
- PostgreSQL connection pooling (already configured)
- Database indexing on frequently searched columns:
  - photographer_id, category_id, event_date
  - user_id, booking_date
- Query pagination (limit/offset) on large result sets
- Redis caching for:
  - Category listings
  - Photographer profiles
  - Top photos/trending
  - Search results (with 5-min TTL)
- CDN for static assets (S3 CloudFront)
- Gzip compression for responses
- HTTP caching headers
- API response pagination

### Infrastructure
- MongoDB or PostgreSQL with proper indexing
- Load balancing for multiple backend instances
- CDN for image delivery
- Database backups and replication
- Monitoring and alerting

---

## 7. Third-Party Integrations

### Payment Processing
- **Stripe**: Credit/Debit card payments
- **PagSeguro or Mercado Pago**: PIX instant transfer
- Installment support (3, 6, 12 months)

### Image Storage & Delivery
- **AWS S3**: Photo storage
- **CloudFront CDN**: Image delivery at scale
- Image optimization service (AWS Lambda)

### Authentication
- Email verification (SendGrid or SES)
- Password reset flows

### Analytics
- Google Analytics 4 for user behavior
- Mixpanel or Amplitude for event tracking
- Custom dashboard analytics

### AWS Services (Optional)
- Rekognition: Facial recognition for photo tagging
- Lambda: Serverless functions for image processing
- SES: Email service for notifications

---

## 8. Implementation Timeline & Phases

### Phase 1: Foundation (Weeks 1-2) ✓ COMPLETED
- Backend setup with Express
- Database schema design
- Frontend setup with React + Router
- Authentication system
- Basic page routing

### Phase 2: Core Features (Weeks 3-6) - IN PROGRESS
- **Week 3**: Category system and photographer profiles
- **Week 4**: Photo gallery management and search
- **Week 5**: Booking system and shopping cart
- **Week 6**: Payment integration (Stripe + PIX)

### Phase 3: Polish & Performance (Weeks 7-8)
- Image optimization and CDN setup
- Caching implementation
- Performance testing and optimization
- UI/UX refinements based on Fotto
- Mobile responsiveness

### Phase 4: Advanced Features (Weeks 9-10)
- Photographer dashboard
- Review and rating system
- Notification system
- Analytics dashboards
- Admin panel

### Phase 5: Launch & Scale (Weeks 11+)
- AWS S3 image hosting
- Facial recognition integration (optional)
- Mobile app (React Native)
- Marketing and SEO
- Production deployment

---

## 9. Technology Stack Summary

### Frontend
- **Framework**: React 18 + TypeScript
- **Bundler**: Vite
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **State Management**: Context API + custom hooks
- **Styling**: CSS Modules or Tailwind CSS
- **UI Components**: Custom built + Headless UI (optional)
- **Form Handling**: React Hook Form
- **Date Picker**: React DatePicker
- **Image Gallery**: Light Gallery or similar
- **Icons**: Feather Icons or Font Awesome

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: JavaScript/TypeScript
- **Database**: PostgreSQL 12+
- **Caching**: Redis (optional)
- **Auth**: JWT + bcryptjs
- **Validation**: Joi or Yup
- **Logging**: Winston or Pino
- **Testing**: Jest + Supertest
- **Deployment**: Docker + Docker Compose

### DevOps & Infrastructure
- **Version Control**: Git + GitHub
- **CI/CD**: GitHub Actions
- **Containerization**: Docker
- **Cloud Hosting**: AWS (EC2, RDS, S3, CloudFront)
- **Monitoring**: CloudWatch or New Relic
- **Error Tracking**: Sentry

---

## 10. Success Metrics & KPIs

- **Performance**: Page load time < 2 seconds
- **Uptime**: 99.5% SLA
- **User Engagement**: > 40% returning visitors
- **Conversion**: > 3% booking completion rate
- **Payment Success**: > 98% payment success rate
- **Mobile Traffic**: Responsive design supporting 50%+ mobile users
- **Search Relevance**: Average search result satisfaction > 4/5 stars
- **Database Query Time**: P95 < 200ms
- **API Response Time**: P95 < 500ms

---

## 11. Next Steps Before Production

1. ✓ Review and approve this planning document
2. ☐ Refine database schema with any adjustments
3. ☐ Create detailed UI/UX mockups (Figma)
4. ☐ Set up development environment
5. ☐ Begin Phase 2 core feature implementation
6. ☐ Implement payment integrations
7. ☐ Set up testing framework
8. ☐ Configure CI/CD pipeline

---

## Approval

**Planning Document Status**: Ready for Review  
**Next Action**: User Approval → Begin High-Performance Production Phase
