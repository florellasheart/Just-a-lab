import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

const BASE = "https://just-a-labback.vercel.app";

export const Register = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "consumer",
    store_name: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al registrar");
        return;
      }

      setSuccess(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError("No se pudo conectar al servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "60px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 10 }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Crear cuenta</h1>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 14 }}>
          ❌ {error}
        </div>
      )}

      {success && (
        <div style={{ background: "#dcfce7", color: "#166534", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 14 }}>
          ✅ Cuenta creada. Redirigiendo...
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          placeholder="Nombre completo"
          value={form.name}
          required
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
        />
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          required
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={form.password}
          required
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value, store_name: "" })}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
        >
          <option value="consumer">🛒 Consumidor</option>
          <option value="store">🏪 Tienda</option>
          <option value="delivery">🛵 Repartidor</option>
        </select>

        {form.role === "store" && (
          <input
            placeholder="Nombre de la tienda"
            value={form.store_name}
            required
            onChange={(e) => setForm({ ...form, store_name: e.target.value })}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
          />
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px",
            background: loading ? "#9ca3af" : "#7c3aed",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: "bold",
            fontSize: 15,
          }}
        >
          {loading ? "Registrando..." : "Registrarse"}
        </button>
      </form>

      <button
        onClick={() => navigate("/login")}
        style={{ marginTop: 12, width: "100%", padding: "8px", background: "transparent", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
      >
        Ya tengo cuenta → Iniciar sesión
      </button>
    </div>
  );
};