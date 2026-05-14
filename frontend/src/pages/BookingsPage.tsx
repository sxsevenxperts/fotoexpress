import { useState, useEffect } from 'react';
import axios from 'axios';

interface Booking {
  id: number;
  event_date: string;
  event_location: string;
  total_price: number;
  status: string;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get('/api/bookings', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => setBookings(res.data))
        .catch(err => console.error('Error:', err));
    }
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1>Minhas Reservas</h1>
      {bookings.length === 0 ? (
        <p>Você não tem reservas ainda</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {bookings.map(booking => (
            <div key={booking.id} style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
              <h3>{booking.event_location}</h3>
              <p>Data: {new Date(booking.event_date).toLocaleDateString('pt-BR')}</p>
              <p>Total: R$ {booking.total_price}</p>
              <p>Status: <strong>{booking.status}</strong></p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
