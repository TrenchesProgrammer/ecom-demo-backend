import {prisma} from "../config/db"
import { Request, Response } from "express";
    const idempotencyCache = new Map();

export const getProduct = async (req: Request, res:Response) => {
    try {
        const product = await prisma.product.findFirst();
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch product" });
    }
}

export const buyProduct =  async (req: Request, res:Response) => {
    const idempotencyKey = req.headers['idempotency-key'];

    if (!idempotencyKey) {
        return res.status(400).json({ success: false, message: "Missing Idempotency-Key header" });
    }

    // Check Idempotency Cache (Handles network retries safely)
    if (idempotencyCache.has(idempotencyKey)) {
        const cached = idempotencyCache.get(idempotencyKey);
        return res.status(cached.status).json({
            ...cached.body,
            note: "Duplicate transaction found"
        });
    }

    try {
        // Core Transaction with Pessimistic Locking (FOR UPDATE)
        const result = await prisma.$transaction(async (tx) => {
            // 1. Lock the specific row in the database so concurrent requests wait in line
            const products:any = await tx.$queryRaw`SELECT * FROM "Product" LIMIT 1 FOR UPDATE`;
            const product = products[0];

            if (!product || product.stock <= 0) {
                throw new Error("Out of stock!");
            }

            // 2. Decrement the stock safely
            await tx.product.update({
                where: { id: product.id },
                data: { stock: product.stock - 1 }
            });

            return { success: true, message: "Purchase successful! " };
        });

        const responsePayload = { status: 200, body: result };
        
        // Save to Idempotency Cache
        idempotencyCache.set(idempotencyKey, responsePayload);

        return res.json(result);

    } catch (error:any) {
        return res.status(400).json({ success: false, message: error.message });
    }
}