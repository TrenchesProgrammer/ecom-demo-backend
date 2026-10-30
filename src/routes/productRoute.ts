import { buyProduct, getProduct, getProductById, getTransactionHistory } from "../controllers/productController";

import express from 'express';
import { buyLimiter } from "../middleware/buyLimit";
const router = express.Router()


router.get('/products',buyLimiter, getProduct); 
router.get('/products/:id', buyLimiter, getProductById);
router.post('/buy', buyLimiter, buyProduct);
router.get("/transactions", buyLimiter, getTransactionHistory)

export default router