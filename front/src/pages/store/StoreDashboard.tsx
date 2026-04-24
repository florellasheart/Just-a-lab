import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabaseClient } from "../../config/supabase";

const BASE = "https://just-a-labback.vercel.app";

interface Store { id: number; name: string; is_open: boolean; }
interface Product { id: number; name: string; price: number; }
interface OrderItem { quantity: number; products: { name: string; price: number } }
interface Order { id: number; status: string; consumer_id: string; order_items: OrderItem[] }

export const StoreDashboard = () => {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [form, setForm] = useState({ name: "", price: "" });
  const [toast, setToast] = useState("");

  const headers = { Authorization: `Bearer ${token}` };

  const getStore = async () => {
    const res = await fetch(`${BASE}/stores`, { headers });
    const data = await res.json();
    const mine = data.find((s: Store & { user_id: string }) => s.user_id === user?.id);
    setStore(mine ?? null);
    if (mine) {
      getProducts(mine.id);
      getOrders(mine.id);
    }
  };

  const getProducts = async (storeId: number) => {
    const res = await fetch(`${BASE}/products/store/${storeId}`, { headers });
    setProducts(await res.json());
  };

  const getOrders = async (storeId: number) => {
    const res = await fetch(`${BASE}/orders/store/${storeId}`, { headers });
    setOrders(await res.json());
  };

  useEffect(() => { getStore(); }, []);

  useEffect(() => {
    if (!store) return;

    const channel = supabaseClient.channel(`store:${store.id}`);
    channel
      .on("broadcast", { event: "order-accepted" }, ({ payload }) => {
        // Comparar como string para evitar mismatch número/string
        setOrders((prev) =>
          prev.map((o) => String(o.id) === String(payload.orderId) ? { ...o, status: "En entrega" } : o)
        );
        showToast(`🚴 Pedido #${payload.orderId} en camino`);
      })
      .on("broadcast", { event: "order-delivered" }, ({ payload }) => {
        setOrders((prev) =>
          prev.map((o) => String(o.id) === String(payload.orderId) ? { ...o, status: "Entregado" } : o)
        );
        showToast(`✅ Pedido #${payload.orderId} entregado`);
      })
      .subscribe();

    return () => { supabaseClient.removeChannel(channel); };
  }, [store?.id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const toggleStore = async () => {
    if (!store) return;
    const endpoint = store.is_open ? "close" : "open";
    await fetch(`${BASE}/stores/${store.id}/${endpoint}`, { method: "PATCH", headers });
    setStore({ ...store, is_open: !store.is_open });
  };

  const createProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!store) return;
    await fetch(`${BASE}/products`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, price: Number(form.price), store_id: store.id }),
    });
    setForm({ name: "", price: "" });
    getProducts(store.id);
  };

  const deleteProduct = async (id: number) => {
    await fetch(`${BASE}/products/${id}`, { method: "DELETE", headers });
    if (store) getProducts(store.id);
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; label: string }> = {
      "Creado":     { bg: "#3b82f6", label: "🆕 Creado"     },
      "En entrega": { bg: "#f59e0b", label: "🚴 En entrega" },
      "Entregado":  { bg: "#22c55e", label: "✅ Entregado"  },
    };
    const { bg, label } = map[status] ?? { bg: "#6b7280", label: status };
    return (
      <span style={{ background: bg, color: "#fff", padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: "bold" }}>
        {label}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 16 }}>
      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, background: "#1e293b", color: "#fff", padding: "10px 18px", borderRadius: 8, zIndex: 999 }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>🏪 {store?.name ?? "Mi Tienda"}</h1>
        <button onClick={handleLogout}>Logout</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ fontWeight: "bold" }}>
          Estado: {store?.is_open ? "🟢 Abierta" : "🔴 Cerrada"}
        </span>
        <button onClick={toggleStore}>
          {store?.is_open ? "Cerrar tienda" : "Abrir tienda"}
        </button>
      </div>

      <h2>Agregar producto</h2>
      <form onSubmit={createProduct} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          placeholder="Nombre del producto"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={{ flex: 1, padding: "4px 8px" }}
        />
        <input
          type="number"
          placeholder="Precio"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          style={{ width: 90, padding: "4px 8px" }}
        />
        <button type="submit">Crear</button>
      </form>

      <h2>Productos</h2>
      {products.length === 0 && <p style={{ color: "#888" }}>Sin productos</p>}
      {products.map((p) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
          <span>{p.name} — ${p.price}</span>
          <button onClick={() => deleteProduct(p.id)}>🗑 Eliminar</button>
        </div>
      ))}

      <h2 style={{ marginTop: 20 }}>Pedidos entrantes</h2>
      {orders.length === 0 && <p style={{ color: "#888" }}>Sin pedidos</p>}
      {orders.map((order) => (
        <div key={order.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "#888" }}>#{order.id}</span>
            {statusBadge(order.status)}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {order.order_items?.map((item, i) => (
              <li key={i}>{item.products?.name} × {item.quantity}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};