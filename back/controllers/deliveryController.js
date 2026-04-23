import { supabase } from "../config/supabase.js";
import { OrderStatus } from "../types/orderStatus.js";

export const getAvailableOrders = async (req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      stores ( id, name ),
      order_items ( quantity, products ( name, price ) )
    `)
    .eq("status", OrderStatus.CREATED)
    .order("id", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const getAcceptedOrders = async (req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      stores ( id, name ),
      order_items ( quantity, products ( name, price ) )
    `)
    .eq("delivery_id", req.user.id)
    .in("status", [OrderStatus.IN_DELIVERY, OrderStatus.DELIVERED])
    .order("id", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const acceptOrder = async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("orders")
    .update({ status: OrderStatus.IN_DELIVERY, delivery_id: req.user.id })
    .eq("id", id)
    .eq("status", OrderStatus.CREATED)
    .select("id, status, store_id, stores(id, name)")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Order not found or already taken" });

  const { data: coords, error: coordsError } = await supabase
    .rpc("get_order_with_coords", { p_order_id: Number(id) });

  if (coordsError) return res.status(500).json({ error: coordsError.message });

  res.json({
    id: data.id,
    status: data.status,
    store_id: data.store_id,
    store_name: data.stores?.name,
    destination_lat: coords[0]?.destination_lat,
    destination_lng: coords[0]?.destination_lng,
  });
};

export const updatePosition = async (req, res) => {
  const { id } = req.params;
  const { lat, lng } = req.body;

  if (lat == null || lng == null) {
    return res.status(400).json({ error: "lat y lng son requeridos" });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ delivery_position: `SRID=4326;POINT(${lng} ${lat})` })
    .eq("id", id)
    .eq("delivery_id", req.user.id)
    .eq("status", OrderStatus.IN_DELIVERY);

  if (updateError) return res.status(500).json({ error: updateError.message });

  const { data: arrived, error: arrivedError } = await supabase
    .rpc("check_delivery_arrived", { p_order_id: Number(id) });

  if (arrivedError) return res.status(500).json({ error: arrivedError.message });

  if (arrived) {
    await supabase
      .from("orders")
      .update({ status: OrderStatus.DELIVERED })
      .eq("id", id);
  }

  res.json({
    arrived: arrived ?? false,
    status: arrived ? OrderStatus.DELIVERED : OrderStatus.IN_DELIVERY,
  });
};

export const declineOrder = async (_req, res) => {
  res.json({ message: "Order declined" });
};