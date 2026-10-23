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

    if (typeof idempotencyKey !== "string") {
        return res.status(400).json({ success: false, message: "Missing Idempotency-Key header" });
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

            if (!product || product.stock <= 0) {
                throw new Error("Out of stock!");
            }

            await tx.product.update({
                where: { id: product.id },
                data: { stock: product.stock - 1 },
            });

            return { success: true, message: "Purchase successful!" };
        }, {
            maxWait: 10000,  // max ms to wait for a connection from the pool
            timeout: 15000,  // max ms the transaction can run
        });

        // Save the final result so retries get the same response
        await redis.set(redisKey, JSON.stringify({ status: "done", body: result }), "EX", KEY_TTL_SECONDS);

        return res.json(result);
    } catch (error: any) {
        // Release the key so the client can retry with the same one
        await redis.del(redisKey);
        return res.status(400).json({ success: false, message: error.message });
    }
};