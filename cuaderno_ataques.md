# Cuaderno de Ataques - Corte 3

## Sección 1: Tres ataques de SQL injection que fallan

Quise poner a prueba la seguridad del campo de búsqueda en el frontend, así que intenté inyectar código SQL desde la caja de texto. 

**Ataque 1: Quote-escape clásico**
- **El input que probé:** `' OR '1'='1`
- **Pantalla:** La pestaña de "Búsqueda" en el Dashboard principal.
- **Resultado:** Falló. No me trajo toda la base de datos, porque el backend no interpretó las comillas simples como un cierre de la condición original.
- **La línea que me defendió:** En `api/routes.js` (línea 32): 
  `result = await client.query('SELECT * FROM mascotas WHERE nombre ILIKE $1', ['%' + nombre + '%']);`
  Esto funcionó para defenderme porque esa función del pool utiliza consultas parametrizadas (el parámetro `$1`), por lo que Postgres procesa el input siempre como texto literal sin ejecutarlo.

**Ataque 2: Stacked query (Intentando borrar tablas)**
- **El input que probé:** `x'; DROP TABLE mascotas; --`
- **Pantalla:** Igual, en el campo de texto de búsqueda de mascotas.
- **Resultado:** Falló, la tabla mascotas sigue ahí sin problemas.
- **La línea que me defendió:** La misma línea 32 de `api/routes.js`. El símbolo de punto y coma se vuelve un bloque de texto inofensivo; postgres jamás lo ve como una señal para separar instrucciones porque el driver lo empaqueta intacto.

**Ataque 3: Union-based**
- **El input que probé:** `' UNION SELECT * FROM usuarios --`
- **Pantalla:** El input del listado en el Dashboard.
- **Resultado:** Falló, no hubo inyección de campos de esquema secundario.
- **La línea que me defendió:** Nuevamente la línea 32 con parámetros, neutralizando la posibilidad de que se concatene una lógica externa o se modifique la macro del comando SELECT real que programé en el backend.

## Sección 2: Demostración de RLS en acción

Para comprobar que RLS hace su magia a nivel fila, armé un escenario rápido donde en la base de datos hay registros de distintos veterinarios y sus pacientes, e hice pruebas desde la interfaz.

- **Veterinario 1 (ID de prueba: 1):** Al entrar logueada con ese rol y colocarle el ID que extrae la API, le mando petición HTTP a la ruta. Postgres evalúa tras cortinas el seteo de rol y el dashboard solo me muestra la lista acotada de MASCOTAS que le corresponden a ese veterinario según la tabla activa de `vet_atiende_mascota`. No le muestra nada más.
- **Veterinario 2 (ID de prueba: 2):** Cierro, recargo y pongo ahora ID 2. Para el backend es casi indistinguible, pero al consultar las tablas, mágicamente la UI me pinta otra lista selectiva y específica excluyendo a los del primer veterinario. Todo sucede en el corazón de la BD.

**Explicación técnica en la política de Postgres:**
El filtrado nace gracias a esta expresión nativa que incluí: `current_setting('app.current_vet_id')`. Postgres jala el valor de esa variable inyectada al vuelo desde el archivo `routes.js` y aplica su filtro evaluador invisible sobre cada `SELECT`.

## Sección 3: Demostración de caché Redis funcionando

Quería asegurarme de no asfixiar a PostgreSQL cada vez que abren masivamente la vista de "Vacunación Pendiente" y aliviar los escaneos de años enteros.

- 1. **Primer intento en "Vacunación" (Cache MISS):** Al darle click inicialmente para listar, el backend pasó de largo de la llave en Redis, tocó a nuestro base relacional y me devolvió la lista. En consola se ve el MISS. La app muestra la heurística original.
- 2. **Actualizar el listado (Cache HIT):** Actualicé de inmediato (dentro del tiempo límite de validez). Los datos esta vez respondieron casi al instante en mi cliente. La consola gritó "CACHE HIT", reflejando que leyó el string cacheado velozmente sin que la base principal recibiera carga extra.
- 3. **Aplicar vacuna nueva e Invalidad de impacto:** Hice click en "Aplicar vacuna" actuando como admin. Esa ruta HTTP en Node internamente conectó todo y al concretar el `INSERT`, mandó a llamar un `redisClient.del('vacunacion_pendiente')`.
- 4. **Comprobación tras mutar datos:** Me fui a "Vacunación", hice click en Refresh, y el sistema soltó otra vez un MISS. El caché limpio en Redis obligó volver a la BD para tener el dataset real con Firulais vacunado y no dejar al backend leyendo una mentira caduca.

El *TimeToLive* (TTL) lo fijé en 300 segundos, como un rango razonable y tolerante para que si no inyectan vacunas manuales y simplemente agendan citas, la lista aguante refrescada 5 minutos de forma estable.
