import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
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

const destinationIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const BASE = "https://just-a-labback.vercel.app";
const STEP = 0.00005;
const CALI = { lat: 3.4516, lng: -76.532 };

interface OrderItem { quantity: number; products: { name: string; price: number } }
interface Order { id: string; status: string; stores: { id: string; name: string }; order_items: OrderItem[] }
interface ActiveOrder {
  id: string;
  store_id: string;
  store_name: string;
  destination_lat: number;
  destination_lng: number;
}

const MapFollower = ({ position }: { position: { lat: number; lng: number } }) => {
  const map = useMap();
  useEffect(() => {
    map.panTo([position.lat, position.lng], { animate: true, duration: 0.3 });
  }, [position, map]);
  return null;
};

export const DeliveryDashboard = () => {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [available, setAvailable] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [position, setPosition] = useState(CALI);
  const [delivered, setDelivered] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPosition = useRef(CALI);
  const channelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);
  const activeOrderRef = useRef<ActiveOrder | null>(null);
  const deliveredRef = useRef(false);
  const tokenRef = useRef(token);

  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);
  useEffect(() => { deliveredRef.current = delivered; }, [delivered]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const getAvailable = async () => {
    const res = await fetch(`${BASE}/delivery/orders/available`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setAvailable(await res.json());
  };

  const getHistory = async () => {
    const res = await fetch(`${BASE}/delivery/orders/accepted`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setHistory(await res.json());
  };

  useEffect(() => { getAvailable(); getHistory(); }, []);

  const acceptOrder = async (id: string) => {
    const res = await fetch(`${BASE}/delivery/orders/${id}/accept`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }

    // Canal del pedido — el consumer lo escucha
    const channel = supabaseClient.channel(`order:${id}`);
    channel.subscribe();
    channelRef.current = channel;

    // Notificar a la store que el pedido fue aceptado
    const storeChannel = supabaseClient.channel(`store:${data.store_id}`);
    storeChannel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        storeChannel.send({
          type: "broadcast",
          event: "order-accepted",
          payload: { orderId: String(id) },
        });
      }
    });

    setActiveOrder({
      id: data.id,
      store_id: data.store_id,
      store_name: data.store_name,
      destination_lat: data.destination_lat,
      destination_lng: data.destination_lng,
    });
    setPosition(CALI);
    pendingPosition.current = CALI;
    setDelivered(false);
    setStatusMsg("");
    getAvailable();
    getHistory();
  };

  const doUpdatePosition = async (pos: { lat: number; lng: number }) => {
    const order = activeOrderRef.current;
    if (!order || deliveredRef.current) return;

    const res = await fetch(`${BASE}/delivery/orders/${order.id}/position`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" },
      body: JSON.stringify(pos),
    });
    const data = await res.json();

    // Broadcast posición al consumer
    channelRef.current?.send({
      type: "broadcast",
      event: "position-update",
      payload: pos,
    });

    if (data.arrived) {
      deliveredRef.current = true;
      setDelivered(true);
      setStatusMsg("✅ ¡Pedido entregado!");

      // Notificar al consumer
      channelRef.current?.send({
        type: "broadcast",
        event: "order-delivered",
        payload: { orderId: String(order.id) },
      });

      // Notificar a la store
      const storeChannel = supabaseClient.channel(`store:${order.store_id}`);
      storeChannel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          storeChannel.send({
            type: "broadcast",
            event: "order-delivered",
            payload: { orderId: String(order.id) },
          });
        }
      });

      getHistory();
    }
  };

  useEffect(() => {
    if (!activeOrder || delivered) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      let { lat, lng } = position;
      switch (e.key) {
        case "ArrowUp":    lat += STEP; break;
        case "ArrowDown":  lat -= STEP; break;
        case "ArrowLeft":  lng -= STEP; break;
        case "ArrowRight": lng += STEP; break;
        default: return;
      }
      e.preventDefault();

      setPosition({ lat, lng });
      pendingPosition.current = { lat, lng };

      if (throttleRef.current) return;
      throttleRef.current = setTimeout(() => {
        doUpdatePosition(pendingPosition.current);
        throttleRef.current = null;
      }, 1000);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [position, activeOrder, delivered]);

  useEffect(() => {
    return () => {
      if (channelRef.current) supabaseClient.removeChannel(channelRef.current);
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, []);

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>Repartidor: {user?.name} 🛵</h1>
        <button onClick={handleLogout}>Logout</button>
      </div>

      {activeOrder && (
        <div style={{ border: "2px solid #7c3aed", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Entregando → {activeOrder.store_name}</h2>
            {statusMsg && (
              <span style={{ background: "#22c55e", color: "#fff", padding: "4px 12px", borderRadius: 8 }}>
                {statusMsg}
              </span>
            )}
          </div>

          {!delivered && (
            <p style={{ fontSize: 13, color: "#7c3aed", margin: "6px 0" }}>
              Usa ← ↑ ↓ → para moverte. Llega al marcador verde.
            </p>
          )}

          <p style={{ fontSize: 12, color: "#888", margin: "4px 0 8px" }}>
            🔵 Tú: {position.lat.toFixed(5)}, {position.lng.toFixed(5)} &nbsp;
            🟢 Destino: {activeOrder.destination_lat.toFixed(5)}, {activeOrder.destination_lng.toFixed(5)}
          </p>

          <MapContainer center={[position.lat, position.lng]} zoom={17} style={{ height: 360, borderRadius: 6 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapFollower position={position} />
            <Marker position={[position.lat, position.lng]} />
            <Marker position={[activeOrder.destination_lat, activeOrder.destination_lng]} icon={destinationIcon} />
          </MapContainer>

          {delivered && (
            <button
              onClick={() => { setActiveOrder(null); setDelivered(false); setStatusMsg(""); }}
              style={{ marginTop: 10, background: "#6b7280", color: "#fff", padding: "6px 14px", border: "none", borderRadius: 6, cursor: "pointer" }}
            >
              Volver a la lista
            </button>
          )}
        </div>
      )}

      {!activeOrder && (
        <>
          <h2>Pedidos disponibles</h2>
          {available.length === 0 && <p style={{ color: "#888" }}>No hay pedidos disponibles</p>}
          {available.map((order) => (
            <div key={order.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: "bold" }}>#{order.id} — {order.stores?.name}</span>
                {statusBadge(order.status)}
              </div>
              <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 14 }}>
                {order.order_items?.map((item, i) => (
                  <li key={i}>{item.products?.name} × {item.quantity}</li>
                ))}
              </ul>
              <button
                onClick={() => acceptOrder(order.id)}
                style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "5px 14px", cursor: "pointer" }}
              >
                Aceptar
              </button>
            </div>
          ))}
        </>
      )}

      <h2 style={{ marginTop: 20 }}>Mis entregas</h2>
      {history.length === 0 && <p style={{ color: "#888" }}>Ninguna aún</p>}
      {history.map((order) => (
        <div key={order.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14 }}>#{order.id} — {order.stores?.name}</span>
          {statusBadge(order.status)}
        </div>
      ))}
    </div>
  );
};