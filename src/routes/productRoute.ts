import { buyProduct, getProduct } from "../controllers/productController";

import express from 'express';
import { buyLimiter } from "../middleware/buyLimit";
const router = express.Router()


router.get('/products', getProduct); 
router.post('/buy', buyLimiter, buyProduct);

export default router