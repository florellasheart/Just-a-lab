import { supabase } from "../config/supabase.js";
import { OrderStatus } from "../types/orderStatus.js";

export const createOrder = async (req, res) => {
  const { store_id, items, lat, lng } = req.body;
  const consumer_id = req.user.id;

  if (!store_id || !items || items.length === 0) {
    return res.status(400).json({ error: "store_id and items[] are required" });
  }
  if (lat == null || lng == null) {
    return res.status(400).json({ error: "lat y lng son requeridos" });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      consumer_id,
      store_id,
      status: OrderStatus.CREATED,
      destination: `SRID=4326;POINT(${lng} ${lat})`,
    })
    .select()
    .single();

  if (orderError) return res.status(500).json({ error: orderError.message });

  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.quantity,
  }));

  const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
  if (itemsError) return res.status(500).json({ error: itemsError.message });

  res.status(201).json({ message: "Order created", order });
};

export const getOrderById = async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase.rpc("get_order_with_coords", {
    p_order_id: Number(id),
  });

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: "Order not found" });

  res.json(data[0]);
};

export const getOrdersByConsumer = async (req, res) => {
  const { consumerId } = req.params;

  if (req.user.id !== consumerId) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      store_id,
      delivery_id,
      stores ( name ),
      order_items ( quantity, products ( name, price ) )
    `)
    .eq("consumer_id", consumerId)
    .order("id", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const getOrdersByStore = async (req, res) => {
  const { storeId } = req.params;

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("user_id", req.user.id)
    .single();

  if (!store) return res.status(403).json({ error: "Unauthorized" });

  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      consumer_id,
      order_items ( quantity, products ( name, price ) )
    `)
    .eq("store_id", storeId)
    .order("id", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const deleteOrder = async (req, res) => {
  const { id } = req.params;

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.consumer_id !== req.user.id) return res.status(403).json({ error: "Unauthorized" });
  if (order.status !== OrderStatus.CREATED) {
    return res.status(400).json({ error: "Solo se pueden cancelar órdenes en estado Creado" });
  }

  await supabase.from("order_items").delete().eq("order_id", id);
  await supabase.from("orders").delete().eq("id", id);

  res.json({ message: "Order cancelled" });
};