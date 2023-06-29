import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

const app = express();

app.use(cors());
app.use(express.json());
dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;
mongoClient.connect()
    .then(() => {
        db = mongoClient.db();
        console.log("MongoDB conectado!");
    })
    .catch((err) => console.log(err.message));

app.post('/teste', async (req, res) => {
    try{
        await db.collection("teste").insertOne({
            nome: "Gisele",
            sobrenome: "Macieira"
        })
        return res.send('Documento adicionado a DB batepapooul e collection teste')
    }catch (err){
        return res.status(500).send(err.message)
    }
})


app.listen(5000, () => console.log("Servidor rodando na porta 5000"));
