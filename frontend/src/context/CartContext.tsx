import { createContext, useState, useContext, ReactNode, useEffect } from 'react';

export interface CartItem {
  photoId: string;
  thumbnailUrl: string;
  price: number;
  galleryId: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (photoId: string) => void;
  clearCart: () => void;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const stored = localStorage.getItem('cart-items');
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem('cart-items', JSON.stringify(items));
    console.log('[CartContext] Saved items to localStorage:', items);
  }, [items]);

  const addItem = (item: CartItem) => {
    console.log('[CartContext] addItem called with:', item);
    setItems(prev => {
      const existing = prev.find(i => i.photoId === item.photoId);
      if (existing) {
        console.log('[CartContext] Item already exists, not adding duplicate');
        return prev;
      }
      const newItems = [...prev, item];
      console.log('[CartContext] Items updated:', newItems);
      return newItems;
    });
  };

  const removeItem = (photoId: string) => {
    setItems(prev => prev.filter(i => i.photoId !== photoId));
  };

  const clearCart = () => {
    setItems([]);
  };

  const total = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart deve ser usado dentro de CartProvider');
  }
  return context;
}
