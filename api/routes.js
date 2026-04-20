const express = require('express');

module.exports = function(pool, redisClient) {
    const router = express.Router();

    // Endpoint 1: Búsqueda de Mascotas (Defensa SQL Injection y RLS)
    router.get('/mascotas', async (req, res) => {
        // Tomamos el nombre a buscar desde la URL (ej: /api/mascotas?nombre=Firu)
        const { nombre } = req.query;
        
        // Obtenemos los headers enviados por el Frontend para simular "login"
        const role = req.headers['x-role']; // Ej: 'rol_veterinario'
        const vetId = req.headers['x-vet-id']; // Ej: '1'

        const client = await pool.connect();
        
        try {
            // Configuramos el RLS para esta petición específica
            if (role) {
                await client.query(`SET ROLE ${role}`);
            }
            if (vetId) {
                await client.query(`SET app.current_vet_id = '${vetId}'`);
            }

            let result;
            // Consulta PARAMETRIZADA (Defensa SQLi: El $1 previene que nos inyecten)
            if (nombre) {
                result = await client.query('SELECT * FROM mascotas WHERE nombre ILIKE $1', ['%' + nombre + '%']);
            } else {
                result = await client.query('SELECT * FROM mascotas');
            }

            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        } finally {
            // MUY IMPORTANTE: Limpiamos la conexión antes de devolverla al pool
            // para que otro usuario no herede accidentalmente estos permisos
            await client.query('DISCARD ALL');
            client.release();
        }
    });

    // Endpoint 2: Caché Funcional (Vacunaciones pendientes)
    router.get('/vacunaciones-pendientes', async (req, res) => {
        try {
            // 1. Buscamos primero en Redis
            const cachedData = await redisClient.get('vacunacion_pendiente');
            
            if (cachedData) {
                console.log('[CACHE HIT] vacunacion_pendiente');
                // Latencia: ~5-20ms (Responde de inmediato)
                return res.json(JSON.parse(cachedData));
            }

            // 2. Si no existe en caché (MISS), consultamos la base de datos
            console.log('[CACHE MISS] Consultando PostgreSQL...');
            const result = await pool.query('SELECT * FROM v_mascotas_vacunacion_pendiente');
            
            // 3. Guardamos el resultado en Redis.
            // TTL justificado: 5 minutos (300 segundos). Suficiente para no ahogar la DB,
            // pero asegurando que la info está fresca.
            await redisClient.setEx('vacunacion_pendiente', 300, JSON.stringify(result.rows));

            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    });

    // Endpoint 3: Registro de vacuna (Invalidación de Caché)
    router.post('/vacunas', async (req, res) => {
        const { mascota_id, vacuna_id, veterinario_id, costo_cobrado } = req.body;

        const role = req.headers['x-role'];
        const vetId = req.headers['x-vet-id'];
        
        const client = await pool.connect();
        
        try {
            // También aquí aplicamos el RLS para ver si tiene permisos de aplicarla
            if (role) {
                await client.query(`SET ROLE ${role}`);
            }
            if (vetId) {
                await client.query(`SET app.current_vet_id = '${vetId}'`);
            }

            // Insertamos
            await client.query(
                `INSERT INTO vacunas_aplicadas (mascota_id, vacuna_id, veterinario_id, costo_cobrado) 
                 VALUES ($1, $2, $3, $4)`,
                [mascota_id, vacuna_id, veterinario_id, costo_cobrado]
            );

            // INVALIDACIÓN DE CACHÉ
            // Como se aplicó una nueva vacuna, la lista de "pendientes" ya no sirve
            await redisClient.del('vacunacion_pendiente');
            console.log('[CACHE INVALIDATED] Se aplicó vacuna, caché de pendientes borrado.');

            res.json({ message: 'Vacuna aplicada y caché invalidado correctamente.' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        } finally {
            await client.query('DISCARD ALL');
            client.release();
        }
    });

    return router;
};
