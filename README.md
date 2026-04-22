# Decisiones de Diseño

**1. ¿Qué política RLS aplicaste a la tabla mascotas? Pega la cláusula exacta y explica con tus palabras qué hace.**

```sql
CREATE POLICY mascotas_vet_policy ON mascotas
    FOR ALL TO rol_veterinario
    USING (
        id IN (SELECT mascota_id FROM vet_atiende_mascota WHERE vet_id = current_setting('app.current_vet_id', TRUE)::INT AND activa = TRUE)
    )
    WITH CHECK (
        id IN (SELECT mascota_id FROM vet_atiende_mascota WHERE vet_id = current_setting('app.current_vet_id', TRUE)::INT AND activa = TRUE)
    );
```

Esta política de Row-Level Security asegura que un veterinario únicamente pueda leer y modificar (UPDATE) los registros en la tabla "mascotas" cuyo "id" esté relacionado a su identificador de sesión. La identidad se extrae de la variable de entorno de sesión "app.current_vet_id" y se cruza con las asignaciones activas en la tabla intermedia "vet_atiende_mascota".

**2. Cualquiera que sea la estrategia que elegiste para identificar al veterinario actual en RLS, tiene un vector de ataque posible. ¿Cuál es? ¿Tu sistema lo previene? ¿Cómo?**

El vector de ataque principal al inyectar el valor en `current_setting('app.current_vet_id')` es el estado persistente u "over-retention" de la conexión. Si el backend usa un pool de conexiones sin limpiarlas y un usuario toma la conexión de un administrador o veterinario anterior, este cliente heredará el contexto y podrá consultar información sensible que no le pertenece.
El sistema lo previene ejecutando la instrucción `DISCARD ALL` en el bloque `finally` de la API tras cada request, antes de devolver la conexión (`client.release()`) al pool. Esto garantiza que cada conexión regrese de forma aséptica y sin variables residuales.

**3. Si usas SECURITY DEFINER en algún procedure, ¿qué medida específica tomaste para prevenir la escalada de privilegios que ese modo habilita? Si no lo usas, justifica por qué no era necesario.**

No se recurrió al uso de SECURITY DEFINER. Esto no fue necesario porque el principio de mínimo privilegio se manejó a nivel del contexto del propio consumidor. Las operaciones del sistema (agendar citas, registrar gastos) son coherentes con las necesidades transaccionales normales del rol veterinario (`rol_veterinario`) o de recepción (`rol_recepcion`). A estos roles se les dotó explícitamente de acceso DML puntual a tablas y secuencias mediante sentencias GRANT formales en el script de permisos (`04_roles_y_permisos.sql`). Operar como SECURITY INVOKER estándar fue suficiente para los flujos de negocio sin exponer un vector de escalamiento de search_path de alto riesgo.

**4. ¿Qué TTL le pusiste al caché Redis y por qué ese valor específico? ¿Qué pasaría si fuera demasiado bajo? ¿Demasiado alto?**

Se optó por un TTL de 300 segundos (5 minutos) para almacenar un snapshot de los registros de vacunación pendiente. Es un punto de equilibrio técnico justificado: esta vista recorre y asocia todo el panorama entre mascotas y vacunas aplicadas del último año, constituyendo una de las consultas de mayor impacto transaccional en la DB.
De fijarse un TTL demasiado bajo (unos pocos segundos), el hit-ratio de la caché en escenarios de consultas recurrentes se desplomaría, neutralizando los beneficios de rendimiento sobre el servidor subyacente de bases de datos relacionales al caer repetitivamente en el modo "MISS".
Si fuera demasiado alto, como de semanas de vigencia sin mecanismos avanzados, existe el riesgo de ver casos vencidos. Un usuario podría leer que una mascota amerita atención e intentar agendar una consulta en paralelo ignorando desactualizaciones sistémicas generadas por el paso de un período crítico irreal. Todo esto es controlado por una vía agresiva de invalidación inmediata (Cache Invalidation) en los endpoints de mutación en la ruta de vacunas aplicadas de la API.

**5. Tu frontend manda input del usuario al backend. Elige un endpoint crítico y pega la línea exacta donde el backend maneja ese input antes de enviarlo a la base de datos. Explica qué protege esa línea y de qué. Indica archivo y número de línea.**

Archivo `api/routes.js`, cerca de la línea 32:

```javascript
result = await client.query('SELECT * FROM mascotas WHERE nombre ILIKE $1', ['%' + nombre + '%']);
```

Esa expresión protege a la transacción contra los distintos estilos de inserción y de Inyección SQL clásica provenientes en el payload del input de texto de consulta del usuario (ya sea concatenación o quote-escaping estático). Actúa delegando los valores en sentencias parametrizadas. Al hacer uso explícito del token `$1`, el driver que conecta Node.js contra PostgreSQL aísla lógicamente el argumento de comando SQL real. PostgreSQL precompila o interpreta la estructura central e ignora radicalmente que pueda subyacer un carácter operativo dentro de los parámetros, invalidando de facto cualquier exploit estructurado como payload destructivo.

**6. Si revocas todos los permisos del rol de veterinario excepto SELECT en mascotas, ¿qué deja de funcionar en tu sistema? Lista tres operaciones que se romperían.**

1. Dejaría de funcionar el flujo primario de registro de la API para vacunar pacientes, al perder permisos nativos orientados sobre `INSERT` en la relación de `vacunas_aplicadas`. Todo el procedure o insertado HTTP sería rechazado en cascada.
2. Cancelaría la viabilidad técnica para registrar citas médicas nuevas y procesar la petición con `sp_agendar_cita`, que está constituida por un insert nativo y el rol vería un rechazo frontal para hacer `INSERT` sobre `citas` o usar su ciclo sobre la `citas_id_seq`.
3. Provocaría la ruptura e interrupción permanente de procesos subyacentes y de auditoría programáticos disparados asincrónicamenrte mediante el motor como lo constituye el callback del disparador y trigger que rastrea anomalías, `trg_historial_cita`, el cual internamente requiere privilegios para asentar records `INSERT` en la tabla `historial_movimientos`.
