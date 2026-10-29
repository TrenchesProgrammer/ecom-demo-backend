import { buyProduct, getProduct, getTransactionHistory } from "../controllers/productController";

import express from 'express';
import { buyLimiter } from "../middleware/buyLimit";
const router = express.Router()


router.get('/products',buyLimiter, getProduct); 
router.post('/buy', buyLimiter, buyProduct);
router.get("/transactions", buyLimiter, getTransactionHistory)

export default router