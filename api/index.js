require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const redis = require('redis');
const initRoutes = require('./routes');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// 1. CONEXIÓN A POSTGRESQL (via el rol authenticator)
// ==========================================
const pool = new Pool({
    user: process.env.DB_USER || 'vet_app',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'clinica_vet',
    password: process.env.DB_PASSWORD || 'vet_secure_password',
    port: process.env.DB_PORT || 5432,
});

// ==========================================
// 2. CONEXIÓN A REDIS
// ==========================================
const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
    }
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect().then(() => console.log('Conectado a Redis')).catch(console.error);

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// RUTAS DE LA API
app.use('/api', initRoutes(pool, redisClient));

// Iniciar servidor
app.listen(port, () => {
    console.log(`API Backend escuchando en http://localhost:${port}`);
});
