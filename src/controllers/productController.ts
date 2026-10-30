import { prisma } from "../config/db";
import { redis } from "../config/redis";
import { Request, Response } from "express";

const KEY_TTL_SECONDS = 60 * 60 * 24; // keep keys for 24 hours

export const getProduct = async (req: Request, res: Response) => {
    try {
        const products = await prisma.product.findMany();
        return res.json(products);
    } catch (error) {
        return res.status(500).json({ error: "Failed to fetch products" });
    }
};

export const getProductById = async (req: Request, res: Response) => {
    const { id } = req.params;

    if (typeof id !== "string") {
        return res.status(400).json({ error: "Invalid product id" });
    }

    try {
        const product = await prisma.product.findUnique({
            where: { productId: id },
        });

        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        return res.json(product);
    } catch (error) {
        return res.status(500).json({ error: "Failed to fetch product" });
    }
};

export const buyProduct = async (req: Request, res: Response) => {
    const idempotencyKey = req.headers["idempotency-key"];
    const guestId = req.get("guest-id")?.trim();
    const { productId, quantity } = req.body; 

    const qty = Number(quantity);

    if (typeof idempotencyKey !== "string") {
        return res.status(400).json({ success: false, message: "Missing Idempotency-Key header" });
    }

    if (!guestId) {
        return res.status(400).json({ success: false, message: "Missing required guest-id header." });
    }

    if (!productId || typeof productId !== "string") {
        return res.status(400).json({ success: false, message: "Missing or invalid productId in request body." });
    }

    // Fix 1: Validate quantity format & value
    if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
        return res.status(400).json({ success: false, message: "Quantity must be a positive integer." });
    }

    const redisKey = `idempotency:${idempotencyKey}`;

    const claimed = await redis.set(redisKey, JSON.stringify({ status: "processing" }), "EX", KEY_TTL_SECONDS, "NX");

    if (!claimed) {
        const existing = JSON.parse((await redis.get(redisKey)) || "{}");

        if (existing.status === "processing") {
            return res.status(409).json({ success: false, message: "Request is still being processed" });
        }

        return res.json({ ...existing.body, note: "Duplicate transaction found" });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const products: any = await tx.$queryRaw`
                SELECT "productId", "stock" 
                FROM "Product" 
                WHERE "productId" = ${productId} 
                FOR UPDATE
            `;
            const product = products[0];

            if (!product) {
                return { success: false, message: "Product not found!" };
            }

            // Fix 2: Check if stock is lower than requested quantity
            if (product.stock < qty) {
                return { success: false, message: "Insufficient stock available!" };
            }

            await tx.product.update({
                where: { productId: product.productId },
                data: { stock: product.stock - qty },
            });

            await tx.transactions.create({
                data: {
                    user: guestId,
                    productId: product.productId,
                    quantity: qty
                },
            });

            return { success: true, message: "Purchase successful!" };
        }, {
            maxWait: 5000,
            timeout: 10000,
        });

        // Fix 3: Handle failed purchase result without locking idempotency key forever
        if (!result.success) {
            await redis.del(redisKey);
            return res.status(400).json(result);
        }

        await redis.set(redisKey, JSON.stringify({ status: "done", body: result }), "EX", KEY_TTL_SECONDS);

        return res.json(result);
    } catch (error: any) {
        await redis.del(redisKey);
        return res.status(500).json({ success: false, message: "Internal server or transaction timeout error" });
    }
};

export const getTransactionHistory = async (req: Request, res: Response) => {
    const guestId = req.get("guest-id")?.trim();
    
    if (!guestId) {
        return res.status(400).json({ 
            success: false, 
            message: "Missing required guest-id header." 
        });
    }
    
    try {
        const transactions = await prisma.transactions.findMany({
            where: { user: guestId },
            orderBy: { createdAt: "desc" } 
        });
        return res.status(200).json({
            message: "success!",
            data: {
                transactions
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch transactions" });
    }
};