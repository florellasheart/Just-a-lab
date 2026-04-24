import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const BASE = "https://just-a-labback.vercel.app";

export const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Credenciales inválidas");
        return;
      }

      login(data.session.access_token, data.role, data.user);

      if (data.role === "consumer") navigate("/consumer");
      else if (data.role === "store") navigate("/store");
      else if (data.role === "delivery") navigate("/delivery");
    } catch (err) {
      setError("No se pudo conectar al servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "60px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 10 }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Iniciar sesión</h1>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 14 }}>
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          placeholder="Email"
          type="email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          required
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
        />
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
          {loading ? "Entrando..." : "Iniciar sesión"}
        </button>
      </form>

      <button
        onClick={() => navigate("/")}
        style={{ marginTop: 12, width: "100%", padding: "8px", background: "transparent", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
      >
        No tengo cuenta → Registrarme
      </button>
    </div>
  );
};