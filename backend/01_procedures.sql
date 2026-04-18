-- =============================================================
-- PROCEDURES Y FUNCIONES
-- =============================================================

CREATE OR REPLACE PROCEDURE sp_agendar_cita(
    p_mascota_id INT,
    p_veterinario_id INT,
    p_fecha_hora TIMESTAMP,
    p_motivo TEXT,
    OUT p_cita_id INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Validaciones básicas
    IF p_fecha_hora < NOW() THEN
        RAISE EXCEPTION 'La fecha y hora de la cita debe ser en el futuro.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM mascotas WHERE id = p_mascota_id) THEN
         RAISE EXCEPTION 'La mascota con ID % no existe o no se tiene acceso.', p_mascota_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM veterinarios WHERE id = p_veterinario_id AND activo = TRUE) THEN
         RAISE EXCEPTION 'El veterinario con ID % no está disponible o no existe.', p_veterinario_id;
    END IF;

    INSERT INTO citas (mascota_id, veterinario_id, fecha_hora, motivo, estado)
    VALUES (p_mascota_id, p_veterinario_id, p_fecha_hora, p_motivo, 'AGENDADA')
    RETURNING id INTO p_cita_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_total_facturado(p_mascota_id INT, p_anio INT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_citas NUMERIC := 0;
    v_total_vacunas NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(costo), 0) INTO v_total_citas
    FROM citas
    WHERE mascota_id = p_mascota_id
      AND EXTRACT(YEAR FROM fecha_hora) = p_anio
      AND estado = 'COMPLETADA';

    SELECT COALESCE(SUM(costo_cobrado), 0) INTO v_total_vacunas
    FROM vacunas_aplicadas
    WHERE mascota_id = p_mascota_id
      AND EXTRACT(YEAR FROM fecha_aplicacion) = p_anio;

    RETURN v_total_citas + v_total_vacunas;
END;
$$;
