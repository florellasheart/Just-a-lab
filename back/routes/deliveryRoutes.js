import { Router } from "express";
import {
  getAvailableOrders,
  getAcceptedOrders,
  acceptOrder,
  declineOrder,
  updatePosition,
} from "../controllers/deliveryController.js";
import { authMiddleware, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

const delivery = [authMiddleware, requireRole("delivery")];

router.get("/orders/available",      ...delivery, getAvailableOrders);
router.get("/orders/accepted",       ...delivery, getAcceptedOrders);
router.patch("/orders/:id/accept",   ...delivery, acceptOrder);
router.post("/orders/:id/decline",   ...delivery, declineOrder);
router.patch("/orders/:id/position", ...delivery, updatePosition);

export default router;