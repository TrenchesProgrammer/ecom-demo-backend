import rateLimit from "express-rate-limit";

export const buyLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 5, 
    message: { success: false, message: "Too many requests! Slow down, nigga." }
});