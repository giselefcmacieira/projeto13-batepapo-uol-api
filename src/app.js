import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import Joi from 'joi';
import dayjs from 'dayjs';

const app = express();

app.use(cors());
app.use(express.json());
dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

function acertaHora (h){
    const hd = h.toString().length;
    if(hd === 1){
        return '0'+h.toString();
    }
    return h.toString()
}

const data = Date.now();
const remocao = data - 10000;
const hora = acertaHora(dayjs(data).hour());
const minutos = acertaHora(dayjs(data).minute());
const segundos = acertaHora(dayjs(data).second());
const horario = `${hora}:${minutos}:${segundos}`;

mongoClient.connect()
    .then(() => {
        db = mongoClient.db();
        console.log("MongoDB conectado!");
    })
    .catch((err) => console.log(err.message));

app.post('/participants', async (req, res) => {
    // Body: { name: "João" }
    const {name} = req.body;
    const participantSchema = Joi.object({
        name: Joi.string().required()
    });

    const validation = participantSchema.validate(req.body, {abortEarly: false});
    if(validation.error){
        //const errors = validation.error.details.map(detail => detail.message);
        return res.sendStatus(422);
    }
    try{
        const participant = await db.collection("participants").findOne({name: name});
        if(participant) return res.sendStatus(409);

        // Formato participante: { name: 'xxx', lastStatus: Date.now() }
        await db.collection("participants").insertOne({
            name: name,
            lastStatus: Date.now()
        });
        // Formato message: { from: 'xxx', to: 'Todos', text: 'entra na sala...', type: 'status', time: 'HH:mm:ss' }
        await db.collection("messages").insertOne({
            from: name, 
            to: 'Todos', 
            text: 'entra na sala...', 
            type: 'status', 
            time: horario
        })
        return res.sendStatus(201);
    }catch (err){
        return res.status(500).send(err.message);
    }
});

app.get('/participants', async (req, res) => {
    try{
        const participants = await db.collection('participants').find().toArray();
        return res.status(201).send(participants);
    }catch (err){
        return res.status(500).send(err.message);
    }
    
});

app.post('/messages', async (req, res) => {
    //Body: { to: "Maria", text: "oi sumida rs", type: "private_message" }
    const {to, text, type} = req.body;
    const User = req.headers.user;
    const from = {user: User}
    const messageSchema = Joi.object({
        to: Joi.string().required(),
        text: Joi.string().required(),
        type: Joi.any().valid('message', 'private_message').required()
    });
    const fromSchema = Joi.object({
        user: Joi.required()
    })
    const validation = messageSchema.validate(req.body, {abortEarly: false});
    if(validation.error){
        //const errors = validation.error.details.map(detail => detail.message);
        return res.sendStatus(422);
    }
    const fromValidation = fromSchema.validate(from, {abortEarly: false});
    if(fromValidation.error){
        return res.sendStatus(422);
    }
    const participant = await db.collection("participants").findOne({name: User});
    if(!participant) return res.sendStatus(422);
    // {from: 'João', to: 'Todos', text: 'oi galera', type: 'message', time: '20:04:37'}
    try{
        await db.collection("messages").insertOne({
            from: User,
            to: to,
            text: text,
            type: type,
            time: horario
        })
        return res.sendStatus(201)
    }catch (err){
        return res.status(500).send(err.message);
    }
});

app.get('/messages', async (req,res) => {
    const limit = parseInt(req.query.limit);
    const limitobj = {limit: limit};
    const User = req.headers.user;
    if(req.query.limit){
        if(isNaN(limit) || limit <= 0){
            return res.sendStatus(422)
        }
    }
    //Formato da mensagem no db {from: 'João', to: 'Todos', text: 'oi galera', type: 'message', time: '20:04:37'}
    //Deve buscar todas as mensagens que tem type:'message', from: User, to: User e to: 'Todos'
    try{
        const userMessages = await db.collection('messages').find({ 
            $or: [ 
                { $and: [{ to: User}, {type: 'private_message'}] }, 
                { to: 'Todos' },
                { from: User }
            ] 
        }).toArray();
        if(!req.query.limit){
            return res.send(userMessages);
        }
        return res.send(userMessages.slice(-limit));
    }catch (err){
        return res.status(500).send(err.message);
    }
    
});

app.post('/status', async (req, res) => {
    const User = req.headers.user;
    if(!User){
        return res.sendStatus(404);
    }
    try{
        const participant = await db.collection('participants').findOne({name: User});
        if(!participant){
            return res.sendStatus(404);
        }
        const userUpdated = {
            name: User,
            lastStatus: Date.now()
        }
        await db.collection('participants').updateOne({name: User}, {$set: userUpdated});
        return res.sendStatus(200);
    }catch{
        return res.status(500).send(err.message);
    }
})

async function remocaoDeUsuariosInativos(){
    //db.inventory.find( { quantity: { $lt: 20 } } )
    //const a = await db.collection('participants').findOne({name: 'Gisele'});
    try{
        const usuariosInativos = await db.collection('participants').find({lastStatus: {$lt: remocao}}).toArray();
        console.log(usuariosInativos);
        if(usuariosInativos.length === 0){
            return console.log('Não tem usuarios inativos');
        }
        usuariosInativos.forEach(async usuario => {
            try{
                await db.collection('participants').deleteOne({name: usuario.name});
                await db.collection('messages').insertOne({
                    from: usuario.name,
                    to: 'Todos',
                    text: 'sai da sala...',
                    type: 'status',
                    time: horario
                })
                return console.log('Usuários inativos removidos com sucesso');
            }catch (err){
                return console.log(err.message);
            } 
        })
    }catch (err){
        return console.log(err.message);
    }
    
}
setInterval(remocaoDeUsuariosInativos, 15000);

app.listen(5000, () => console.log("Servidor rodando na porta 5000"));
