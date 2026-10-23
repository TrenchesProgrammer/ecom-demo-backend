import express from 'express';
import productRoute from './routes/productRoute'
import cors from 'cors'

const app = express()
const PORT = Number(process.env.PORT) || 3000
const server = app.listen(PORT, ()=>{
    console.log("Server is running on PORT: ", PORT)
});
app.use(cors({
    origin: 'http://localhost:4000', // Allow Next.js frontend
    credentials: true
}));
app.use(express.json());
app.use("/api", productRoute)

export default app;