import { Router } from "express";
import {
  createOrder,
  getOrderById,
  getOrdersByConsumer,
  getOrdersByStore,
  deleteOrder,
} from "../controllers/ordersController.js";
import { authMiddleware, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/",                    authMiddleware, requireRole("consumer"), createOrder);
router.get("/consumer/:consumerId", authMiddleware, getOrdersByConsumer);
router.get("/store/:storeId",       authMiddleware, requireRole("store"), getOrdersByStore);
router.get("/:id",                  authMiddleware, getOrderById);
router.delete("/:id",               authMiddleware, requireRole("consumer"), deleteOrder);

export default router;