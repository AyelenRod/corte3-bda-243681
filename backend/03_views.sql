-- =============================================================
-- VISTAS
-- =============================================================

CREATE OR REPLACE VIEW v_mascotas_vacunacion_pendiente AS
SELECT m.id AS mascota_id, m.nombre AS mascota_nombre, d.nombre AS dueno_nombre, d.telefono
FROM mascotas m
JOIN duenos d ON m.dueno_id = d.id
WHERE NOT EXISTS (
    SELECT 1 FROM vacunas_aplicadas va
    WHERE va.mascota_id = m.id 
      AND va.fecha_aplicacion >= (CURRENT_DATE - INTERVAL '1 year')
);
