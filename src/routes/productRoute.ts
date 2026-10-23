import { buyProduct, getProduct } from "../controllers/productController.ts";

import express from 'express';
import { buyLimiter } from "../middleware/buyLimit.ts";
const router = express.Router()


router.get('/products', getProduct); 
router.post('/buy', buyLimiter, buyProduct);

export default router