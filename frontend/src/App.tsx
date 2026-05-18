import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PhotographersPage from './pages/PhotographersPage';
import PhotographerDetailPage from './pages/PhotographerDetailPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import BookingsPage from './pages/BookingsPage';
import ProfilePage from './pages/ProfilePage';
import SharedGalleryPage from './pages/SharedGalleryPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import DownloadsPage from './pages/DownloadsPage';
import SelfieScanPage from './pages/SelfieScanPage';
import PhotographerDashboard from './pages/PhotographerDashboard';
import PhotoUploadPage from './pages/PhotoUploadPage';
import WishlistPage from './pages/WishlistPage';
import MessagesPage from './pages/MessagesPage';
import PrintOrderPage from './pages/PrintOrderPage';
import Navigation from './components/Navigation';
import { CartProvider } from './context/CartContext';

function App() {
  return (
    <Router>
      <CartProvider>
        <Navigation />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/photographers" element={<PhotographersPage />} />
          <Route path="/photographers/:id" element={<PhotographerDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/galleries/share/:shareToken" element={<SharedGalleryPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/scan/:galleryId" element={<SelfieScanPage />} />
          <Route path="/dashboard" element={<PhotographerDashboard />} />
          <Route path="/galleries/:galleryId/upload" element={<PhotoUploadPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/photos/:photoId/print" element={<PrintOrderPage />} />
        </Routes>
      </CartProvider>
    </Router>
  );
}

export default App;
