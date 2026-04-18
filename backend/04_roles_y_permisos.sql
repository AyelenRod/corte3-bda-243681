-- =============================================================
-- ROLES Y PERMISOS
-- =============================================================

-- 1. Crear roles principales descritos en la regla de negocio
DROP ROLE IF EXISTS rol_admin;
CREATE ROLE rol_admin NOLOGIN CREATEROLE;

DROP ROLE IF EXISTS rol_veterinario;
CREATE ROLE rol_veterinario NOLOGIN;

DROP ROLE IF EXISTS rol_recepcion;
CREATE ROLE rol_recepcion NOLOGIN;

-- (Opcional) Rol de conexión (authenticator) para la API
DROP ROLE IF EXISTS vet_app;
CREATE ROLE vet_app LOGIN PASSWORD 'vet_secure_password';

-- Otorgar roles al rol de conexión para que pueda asumir roles de negocio con SET ROLE
GRANT rol_admin TO vet_app;
GRANT rol_veterinario TO vet_app;
GRANT rol_recepcion TO vet_app;

-- 2. Permisos para rol_admin (Administrador)
-- Ve todo. Puede crear usuarios, asignar mascotas a veterinarios, y gestionar inventario.
GRANT USAGE ON SCHEMA public TO rol_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO rol_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO rol_admin;

-- 3. Permisos para rol_recepcion (Recepción)
-- Ve todas las mascotas y sus dueños (datos de contacto). Puede agendar citas.
-- No puede ver vacunas aplicadas.
GRANT USAGE ON SCHEMA public TO rol_recepcion;
GRANT SELECT ON duenos, mascotas, veterinarios, citas TO rol_recepcion;
GRANT INSERT, UPDATE ON citas TO rol_recepcion;
GRANT INSERT ON historial_movimientos TO rol_recepcion; -- Necesario para que el trigger trg_historial_cita funcione sin fallar por permisos
GRANT USAGE ON SEQUENCE citas_id_seq, historial_movimientos_id_seq TO rol_recepcion;
-- Como no se le hace GRANT sobre vacunas_aplicadas, PostgreSQL denegará todo a nivel tabla (sin siquiera llegar a RLS).

-- 4. Permisos para rol_veterinario (Veterinario)
-- Ve las mascotas que atiende (restringido vía RLS).
-- Puede registrar nuevas citas y aplicar vacunas a sus mascotas.
GRANT USAGE ON SCHEMA public TO rol_veterinario;
GRANT SELECT ON mascotas, duenos, citas, vacunas_aplicadas, inventario_vacunas, vet_atiende_mascota, veterinarios, historial_movimientos TO rol_veterinario;
GRANT INSERT, UPDATE ON citas, vacunas_aplicadas TO rol_veterinario;
GRANT INSERT ON historial_movimientos TO rol_veterinario; -- Necesario para que el trigger trg_historial_cita funcione sin fallar
-- Se les da acceso a la secuencia para que puedan insertar sin problema
GRANT USAGE ON SEQUENCE citas_id_seq, vacunas_aplicadas_id_seq, historial_movimientos_id_seq TO rol_veterinario;
