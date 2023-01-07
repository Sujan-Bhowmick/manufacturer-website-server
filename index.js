const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken')
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5001;

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aapjwra.mongodb.net/?retryWrites=true&w=majority&ssl=true`;
console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "UnAuthorized Access" })
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        await client.connect();
        const productCollection = client.db('car_parts').collection('products');
        const orderCollection = client.db('car_parts').collection('orders');
        const userCollection = client.db('car_parts').collection('users');
        const paymentCollection = client.db('car_parts').collection('payments');

        app.get('/product', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const products = await cursor.toArray();
            // const products = await productCollection.find().toArray()
            res.send(products);
        })

        app.get('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const product = await productCollection.findOne(query);
            res.send(product);
        })

        app.post('/order', async (req, res) => {
            const newOrder = req.body;
            const result = await orderCollection.insertOne(newOrder)
            res.send(result)
        })

        app.get('/order', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email }
                const orders = await orderCollection.find(query).toArray();
                return res.send(orders);
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' })
            }

        });

        app.get('/order/:id', verifyJWT, async(req, res) => {
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const order = await orderCollection.findOne(query);
            res.send(order);

        });

        app.patch('/order/:id',verifyJWT, async(req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = {_id:ObjectId(id)};
            const updatedDoc ={
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
           
            const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
            const result = await paymentCollection.insertOne(payment);
            res.send(updatedDoc)
        })

        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updatedDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updatedDoc);
                res.send(result)
            }

            else {
                res.status(403).send({ message: 'forbidden' })
            }
        });

        app.get('/admin/:email', async(req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user.role === 'admin';
            res.send({admin : isAdmin})
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options);

            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token })
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        app.post('/create-payment-intent', verifyJWT, async(req, res) => {
            const product = req.body;
            const price = product.price;
            const amount = price* 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount, 
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({clientSecret: paymentIntent.client_secret})
        })
    }
    finally {

    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('hello manufacturer')
})

app.listen(port, () => {
    console.log('listening to port', port)
})