import { prisma } from "../config/db";
import { redis } from "../config/redis";
import { Request, Response } from "express";

const KEY_TTL_SECONDS = 60 * 60 * 24; // keep keys for 24 hours

export const getProduct = async (req: Request, res: Response) => {
    try {
        const product = await prisma.product.findFirst();
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch product" });
    }
};

export const buyProduct = async (req: Request, res: Response) => {
    const idempotencyKey = req.headers["idempotency-key"];
    const guestId = req.get("guest-id")?.trim();

    if (typeof idempotencyKey !== "string") {
        return res.status(400).json({ success: false, message: "Missing Idempotency-Key header" });
    }

    if (!guestId) {
        return res.status(400).json({ success: false, message: "Missing required guest-id header." });
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
            const products: any = await tx.$queryRaw`SELECT * FROM "Product" LIMIT 1 FOR UPDATE`;
            const product = products[0];

            // FIX: Return a response object instead of throwing an error to prevent Prisma retry loops
            if (!product || product.stock <= 0) {
                return { success: false, message: "Out of stock!" };
            }

            await tx.product.update({
                where: { productId: product.productId },
                data: { stock: product.stock - 1 },
            });
             await tx.transactions.create({
                data: {
                
                    user: guestId,
                    productId: product.productId,
                },
            });

            return { success: true, message: "Purchase successful!" };
        }, {
            maxWait: 5000,  // Increased to allow more buffer time to acquire a connection
            timeout: 10000, // Increased to allow long-running processes to finish safely
        });
        
        // Save the final result so retries get the same response (even out of stock results)
        await redis.set(redisKey, JSON.stringify({ status: "done", body: result }), "EX", KEY_TTL_SECONDS);
        
        if (!result.success) {
            return res.status(400).json(result);
        }
        
        return res.json(result);
    } catch (error: any) {
        // Release the key so the client can retry with the same one if an actual DB crash occurred
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
            where: { user: guestId }
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
