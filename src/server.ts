import express from 'express';
import productRoute from './routes/productRoute'
import cors from 'cors'

const app = express()
const PORT = Number(process.env.PORT) || 3000
const server = app.listen(PORT, ()=>{
    console.log("Server is running on PORT: ", PORT)
});
app.use(cors({
    origin: 'https://ecom-demo-frontend.vercel.app', 
    credentials: true
}));
app.use(express.json());
app.use("/api", productRoute)

export default app;