import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../../context/AuthContext";
import { supabaseClient } from "../../config/supabase";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const deliveryIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const BASE = "https://just-a-labback.vercel.app";
const CALI = { lat: 3.4516, lng: -76.532 };

interface Store { id: string; name: string; is_open: boolean; }
interface Product { id: string; name: string; price: number; }
interface CartItem { product_id: string; name: string; quantity: number; }
interface OrderItem { quantity: number; products: { name: string; price: number } }
interface Order {
  id: number;
  status: string;
  stores: { name: string };
  order_items: OrderItem[];
}

const MapClickHandler = ({ onSelect }: { onSelect: (lat: number, lng: number) => void }) => {
  useMapEvents({ click: (e) => onSelect(e.latlng.lat, e.latlng.lng) });
  return null;
};

export const ConsumerDashboard = () => {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [trackingDest, setTrackingDest] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryPos, setDeliveryPos] = useState<{ lat: number; lng: number } | null>(null);
  const [toast, setToast] = useState("");
  const channelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const getStores = async () => {
    const res = await fetch(`${BASE}/stores`, { headers });
    const data = await res.json();
    setStores(data.filter((s: Store) => s.is_open));
  };

  const getProducts = async (storeId: string) => {
    const res = await fetch(`${BASE}/products/store/${storeId}`, { headers });
    setProducts(await res.json());
  };

  const getOrders = async () => {
    const res = await fetch(`${BASE}/orders/consumer/${user?.id}`, { headers });
    setOrders(await res.json());
  };

  useEffect(() => { getStores(); getOrders(); }, []);

  const selectStore = (store: Store) => {
    setSelectedStore(store);
    setCart([]);
    setDestination(null);
    getProducts(store.id);
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const exists = prev.find((i) => i.product_id === product.id);
      return exists
        ? prev.map((i) => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { product_id: product.id, name: product.name, quantity: 1 }];
    });
  };

  const decreaseQty = (productId: string) =>
    setCart((prev) =>
      prev.map((i) => i.product_id === productId ? { ...i, quantity: i.quantity - 1 } : i)
          .filter((i) => i.quantity > 0)
    );

  const removeItem = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.product_id !== productId));

  const createOrder = async () => {
    if (!destination) { alert("Selecciona tu punto de entrega en el mapa"); return; }
    await fetch(`${BASE}/orders`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        store_id: selectedStore?.id,
        items: cart,
        lat: destination.lat,
        lng: destination.lng,
      }),
    });
    setCart([]);
    setSelectedStore(null);
    setProducts([]);
    setDestination(null);
    getOrders();
  };

  const deleteOrder = async (orderId: number) => {
    await fetch(`${BASE}/orders/${orderId}`, { method: "DELETE", headers });
    getOrders();
  };

  const openTracking = async (orderId: number) => {
    const res = await fetch(`${BASE}/orders/${orderId}`, { headers });
    const data = await res.json();

    setTrackingOrderId(orderId);
    setTrackingDest({ lat: data.destination_lat, lng: data.destination_lng });
    setDeliveryPos(
      data.delivery_lat != null
        ? { lat: data.delivery_lat, lng: data.delivery_lng }
        : null
    );

    const channel = supabaseClient.channel(`order:${orderId}`);
    channel
      .on("broadcast", { event: "position-update" }, ({ payload }) => {
        setDeliveryPos({ lat: payload.lat, lng: payload.lng });
      })
      .on("broadcast", { event: "order-delivered" }, () => {
        setToast("🎉 ¡Tu pedido ha llegado!");
        // Comparar como string para evitar mismatch número/string
        setOrders((prev) =>
          prev.map((o) => String(o.id) === String(orderId) ? { ...o, status: "Entregado" } : o)
        );
        setTimeout(() => setToast(""), 5000);
      })
      .subscribe();

    channelRef.current = channel;
  };

  const closeTracking = () => {
    if (channelRef.current) supabaseClient.removeChannel(channelRef.current);
    setTrackingOrderId(null);
    setTrackingDest(null);
    setDeliveryPos(null);
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      "Creado": "#3b82f6", "En entrega": "#f59e0b", "Entregado": "#22c55e",
    };
    return (
      <span style={{ background: colors[status] ?? "#6b7280", color: "#fff", padding: "2px 10px", borderRadius: 12, fontSize: 12 }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 16 }}>
      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, background: "#22c55e", color: "#fff", padding: "12px 20px", borderRadius: 8, fontWeight: "bold", zIndex: 999 }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>Hola, {user?.name} 👋</h1>
        <button onClick={handleLogout}>Logout</button>
      </div>

      {!selectedStore ? (
        <>
          <h2>Tiendas abiertas</h2>
          {stores.length === 0 && <p>No hay tiendas abiertas</p>}
          {stores.map((store) => (
            <div key={store.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span>{store.name}</span>
              <button onClick={() => selectStore(store)}>Ver productos</button>
            </div>
          ))}
        </>
      ) : (
        <>
          <button onClick={() => { setSelectedStore(null); setProducts([]); }}>← Volver</button>
          <h2>{selectedStore.name}</h2>

          {products.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>{p.name} — ${p.price}</span>
              <button onClick={() => addToCart(p)}>Agregar</button>
            </div>
          ))}

          <h3>Carrito</h3>
          {cart.length === 0 && <p style={{ color: "#888" }}>Vacío</p>}
          {cart.map((item) => (
            <div key={item.product_id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ flex: 1 }}>{item.name}</span>
              <button onClick={() => decreaseQty(item.product_id)}>−</button>
              <span>{item.quantity}</span>
              <button onClick={() => addToCart({ id: item.product_id, name: item.name, price: 0 })}>+</button>
              <button onClick={() => removeItem(item.product_id)}>🗑</button>
            </div>
          ))}

          <h3>📍 Elige tu punto de entrega</h3>
          <p style={{ fontSize: 13, color: "#666" }}>Haz click en el mapa para seleccionar dónde quieres recibir el pedido.</p>
          <MapContainer center={[CALI.lat, CALI.lng]} zoom={14} style={{ height: 280, borderRadius: 6 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapClickHandler onSelect={(lat, lng) => setDestination({ lat, lng })} />
            {destination && <Marker position={[destination.lat, destination.lng]} />}
          </MapContainer>
          {destination
            ? <p style={{ fontSize: 13, color: "#22c55e", marginTop: 4 }}>✅ Destino: {destination.lat.toFixed(5)}, {destination.lng.toFixed(5)}</p>
            : <p style={{ fontSize: 13, color: "#f59e0b", marginTop: 4 }}>⚠️ Sin destino seleccionado</p>
          }

          {cart.length > 0 && (
            <button onClick={createOrder} style={{ marginTop: 10, background: "#7c3aed", color: "#fff", padding: "8px 20px", border: "none", borderRadius: 6, cursor: "pointer" }}>
              Hacer pedido
            </button>
          )}
        </>
      )}

      {trackingOrderId && trackingDest && (
        <div style={{ border: "2px solid #3b82f6", borderRadius: 8, padding: 12, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong>🗺 Rastreando pedido</strong>
            <button onClick={closeTracking}>✕ Cerrar</button>
          </div>
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 8px" }}>🔵 Azul = tu destino &nbsp; 🔴 Rojo = repartidor</p>
          <MapContainer center={[trackingDest.lat, trackingDest.lng]} zoom={16} style={{ height: 320, borderRadius: 6 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[trackingDest.lat, trackingDest.lng]} />
            {deliveryPos && <Marker position={[deliveryPos.lat, deliveryPos.lng]} icon={deliveryIcon} />}
          </MapContainer>
          {!deliveryPos && <p style={{ fontSize: 13, color: "#888", marginTop: 6 }}>Esperando que el repartidor se mueva…</p>}
        </div>
      )}

      <h2 style={{ marginTop: 28 }}>Mis pedidos</h2>
      {orders.length === 0 && <p>No tienes pedidos aún</p>}
      {orders.map((order) => (
        <div key={order.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#888" }}>#{order.id} — {order.stores?.name}</span>
            {statusBadge(order.status)}
          </div>
          <ul style={{ margin: "6px 0 8px", paddingLeft: 18, fontSize: 14 }}>
            {order.order_items?.map((item, i) => (
              <li key={i}>{item.products?.name} × {item.quantity}</li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8 }}>
            {order.status === "Creado" && (
              <button onClick={() => deleteOrder(order.id)}>Cancelar</button>
            )}
            {order.status === "En entrega" && (
              <button onClick={() => openTracking(order.id)} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>
                🗺 Rastrear
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};