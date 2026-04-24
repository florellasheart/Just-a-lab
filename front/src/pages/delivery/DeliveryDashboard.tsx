import { useEffect, useState, useRef, useCallback } from "react";
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

// Componente que mueve el mapa cuando cambia la posición
const MapFollower = ({ position }: { position: { lat: number; lng: number } }) => {
  const map = useMap();
  useEffect(() => {
    map.panTo([position.lat, position.lng], { animate: true, duration: 0.3 });
  }, [position.lat, position.lng]);
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
  const [mapKey, setMapKey] = useState(0); // fuerza re-mount del mapa al aceptar orden

  // Refs para evitar stale closures en el listener de teclado
  const positionRef = useRef(CALI);
  const activeOrderRef = useRef<ActiveOrder | null>(null);
  const deliveredRef = useRef(false);
  const tokenRef = useRef(token);
  const channelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPosition = useRef(CALI);

  // Mantener refs sincronizados
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);
  useEffect(() => { deliveredRef.current = delivered; }, [delivered]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const getAvailable = async () => {
    const res = await fetch(`${BASE}/delivery/orders/available`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setAvailable(Array.isArray(data) ? data : []);
  };

  const getHistory = async () => {
    const res = await fetch(`${BASE}/delivery/orders/accepted`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setHistory(Array.isArray(data) ? data : []);
  };

  useEffect(() => { getAvailable(); getHistory(); }, []);

  // Envía PATCH al backend con la posición actual (lo que el profe exige)
  const doUpdatePosition = useCallback(async (pos: { lat: number; lng: number }) => {
    const order = activeOrderRef.current;
    if (!order || deliveredRef.current) return;

    try {
      const res = await fetch(`${BASE}/delivery/orders/${order.id}/position`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
      });

      const data = await res.json();

      if (data.arrived) {
        deliveredRef.current = true;
        setDelivered(true);
        setStatusMsg("✅ ¡Pedido entregado!");

        // Notificar al consumer via broadcast
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
    } catch (err) {
      console.error("Error actualizando posición:", err);
    }
  }, []);

  // ⭐ LISTENER DE TECLADO — el corazón del movimiento
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Solo funciona si hay orden activa y no fue entregada
      if (!activeOrderRef.current || deliveredRef.current) return;

      const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!arrows.includes(e.key)) return;

      e.preventDefault(); // evita scroll de página

      // Calcula nueva posición basándose en la ref (siempre actualizada)
      let { lat, lng } = positionRef.current;
      switch (e.key) {
        case "ArrowUp":    lat += STEP; break;
        case "ArrowDown":  lat -= STEP; break;
        case "ArrowLeft":  lng -= STEP; break;
        case "ArrowRight": lng += STEP; break;
      }

      const newPos = { lat, lng };

      // 1. Actualiza el marcador en el mapa INMEDIATAMENTE
      setPosition(newPos);
      positionRef.current = newPos;
      pendingPosition.current = newPos;

      // 2. Throttle: máximo 1 PATCH por segundo al backend
      if (throttleRef.current) return;
      throttleRef.current = setTimeout(() => {
        doUpdatePosition(pendingPosition.current);
        throttleRef.current = null;
      }, 1000);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
    };
  }, []); // [] porque todo se lee desde refs, no hay stale closure

  const acceptOrder = async (id: string) => {
    const res = await fetch(`${BASE}/delivery/orders/${id}/accept`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }

    // Canal del pedido para broadcast al consumer
    if (channelRef.current) supabaseClient.removeChannel(channelRef.current);
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

    const newActiveOrder = {
      id: data.id,
      store_id: data.store_id,
      store_name: data.store_name,
      destination_lat: data.destination_lat,
      destination_lng: data.destination_lng,
    };

    // Reset posición al aceptar
    const startPos = CALI;
    setPosition(startPos);
    positionRef.current = startPos;
    pendingPosition.current = startPos;
    deliveredRef.current = false;

    setActiveOrder(newActiveOrder);
    activeOrderRef.current = newActiveOrder;
    setDelivered(false);
    setStatusMsg("");
    setMapKey((k) => k + 1); // fuerza re-mount del mapa con centro correcto

    getAvailable();
    getHistory();
  };

  const handleLogout = () => {
    if (channelRef.current) supabaseClient.removeChannel(channelRef.current);
    logout();
    navigate("/login");
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      "Creado": "#3b82f6",
      "En entrega": "#f59e0b",
      "Entregado": "#22c55e",
    };
    return (
      <span style={{
        background: colors[status] ?? "#6b7280",
        color: "#fff",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 12,
      }}>
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

      {/* ⭐ SECCIÓN ACTIVA: mapa con movimiento de teclas */}
      {activeOrder && (
        <div style={{ border: "2px solid #7c3aed", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Entregando → {activeOrder.store_name}</h2>
            {statusMsg && (
              <span style={{ background: "#22c55e", color: "#fff", padding: "4px 12px", borderRadius: 8, fontWeight: "bold" }}>
                {statusMsg}
              </span>
            )}
          </div>

          {!delivered && (
            <div style={{ background: "#f3f0ff", border: "1px solid #7c3aed", borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontSize: 13, color: "#5b21b6" }}>
              ⌨️ Usa <strong>← ↑ ↓ →</strong> para mover el repartidor. Llega al marcador 🟢 verde.
            </div>
          )}

          <p style={{ fontSize: 12, color: "#888", margin: "4px 0 8px" }}>
            🔵 Tú: {position.lat.toFixed(6)}, {position.lng.toFixed(6)} &nbsp;|&nbsp;
            🟢 Destino: {activeOrder.destination_lat.toFixed(6)}, {activeOrder.destination_lng.toFixed(6)}
          </p>

          {/* key={mapKey} fuerza re-mount limpio al aceptar nueva orden */}
          <MapContainer
            key={mapKey}
            center={[position.lat, position.lng]}
            zoom={17}
            style={{ height: 380, borderRadius: 8, zIndex: 0 }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapFollower position={position} />
            {/* Marcador azul = repartidor */}
            <Marker position={[position.lat, position.lng]} />
            {/* Marcador verde = destino del pedido */}
            <Marker
              position={[activeOrder.destination_lat, activeOrder.destination_lng]}
              icon={destinationIcon}
            />
          </MapContainer>

          {delivered && (
            <button
              onClick={() => {
                setActiveOrder(null);
                activeOrderRef.current = null;
                setDelivered(false);
                deliveredRef.current = false;
                setStatusMsg("");
                getAvailable();
              }}
              style={{
                marginTop: 10,
                background: "#6b7280",
                color: "#fff",
                padding: "8px 16px",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Volver a la lista
            </button>
          )}
        </div>
      )}

      {/* Lista de pedidos disponibles */}
      {!activeOrder && (
        <>
          <h2>Pedidos disponibles</h2>
          {available.length === 0 && (
            <p style={{ color: "#888", fontStyle: "italic" }}>No hay pedidos disponibles ahora</p>
          )}
          {available.map((order) => (
            <div key={order.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: "bold" }}>#{order.id} — {order.stores?.name}</span>
                {statusBadge(order.status)}
              </div>
              <ul style={{ margin: "4px 0 10px", paddingLeft: 18, fontSize: 14 }}>
                {order.order_items?.map((item, i) => (
                  <li key={i}>{item.products?.name} × {item.quantity}</li>
                ))}
              </ul>
              <button
                onClick={() => acceptOrder(order.id)}
                style={{
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 16px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                🛵 Aceptar pedido
              </button>
            </div>
          ))}
        </>
      )}

      {/* Historial */}
      <h2 style={{ marginTop: 20 }}>Mis entregas</h2>
      {history.length === 0 && <p style={{ color: "#888" }}>Ninguna aún</p>}
      {history.map((order) => (
        <div key={order.id} style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 10,
          marginBottom: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 14 }}>#{order.id} — {order.stores?.name}</span>
          {statusBadge(order.status)}
        </div>
      ))}
    </div>
  );
};