-- =============================================================
-- SEGURIDAD POR FILAS (RLS)
-- =============================================================

-- ==========================================
-- 1. MASCOTAS
-- ==========================================
ALTER TABLE mascotas FORCE ROW LEVEL SECURITY;
ALTER TABLE mascotas ENABLE ROW LEVEL SECURITY;

-- Administrador: ve todo
CREATE POLICY mascotas_admin_policy ON mascotas
    FOR ALL TO rol_admin USING (TRUE) WITH CHECK (TRUE);

-- Recepción: ve todo
CREATE POLICY mascotas_recepcion_policy ON mascotas
    FOR ALL TO rol_recepcion USING (TRUE) WITH CHECK (TRUE);

-- Veterinario: solo ve mascotas que atiende
CREATE POLICY mascotas_vet_policy ON mascotas
    FOR ALL
    TO rol_veterinario
    USING (
        id IN (
            SELECT mascota_id 
            FROM vet_atiende_mascota 
            WHERE vet_id = current_setting('app.current_vet_id', TRUE)::INT
              AND activa = TRUE
        )
    )
    WITH CHECK (
        id IN (
            SELECT mascota_id 
            FROM vet_atiende_mascota 
            WHERE vet_id = current_setting('app.current_vet_id', TRUE)::INT
              AND activa = TRUE
        )
    );

-- ==========================================
-- 2. VACUNAS APLICADAS
-- ==========================================
ALTER TABLE vacunas_aplicadas FORCE ROW LEVEL SECURITY;
ALTER TABLE vacunas_aplicadas ENABLE ROW LEVEL SECURITY;

-- Administrador: ve todo
CREATE POLICY vacunas_admin_policy ON vacunas_aplicadas
    FOR ALL TO rol_admin USING (TRUE) WITH CHECK (TRUE);

-- Recepción: no ve nada (ya bloqueado por GRANT, pero por seguridad añadimos)
CREATE POLICY vacunas_recepcion_policy ON vacunas_aplicadas
    FOR ALL TO rol_recepcion USING (FALSE) WITH CHECK (FALSE);

-- Veterinario: solo ve vacunas de las mascotas que atiende
CREATE POLICY vacunas_vet_policy ON vacunas_aplicadas
    FOR ALL
    TO rol_veterinario
    USING (
        mascota_id IN (
            SELECT mascota_id 
            FROM vet_atiende_mascota 
            WHERE vet_id = current_setting('app.current_vet_id', TRUE)::INT
              AND activa = TRUE
        )
    )
    WITH CHECK (
        mascota_id IN (
            SELECT mascota_id 
            FROM vet_atiende_mascota 
            WHERE vet_id = current_setting('app.current_vet_id', TRUE)::INT
              AND activa = TRUE
        )
    );

-- ==========================================
-- 3. CITAS
-- ==========================================
ALTER TABLE citas FORCE ROW LEVEL SECURITY;
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;

-- Administrador: ve todo
CREATE POLICY citas_admin_policy ON citas
    FOR ALL TO rol_admin USING (TRUE) WITH CHECK (TRUE);

-- Recepción: ve todo
CREATE POLICY citas_recepcion_policy ON citas
    FOR ALL TO rol_recepcion USING (TRUE) WITH CHECK (TRUE);

-- Veterinario: solo ve citas donde él es el asignado
CREATE POLICY citas_vet_policy ON citas
    FOR ALL
    TO rol_veterinario
    USING (veterinario_id = current_setting('app.current_vet_id', TRUE)::INT)
    WITH CHECK (veterinario_id = current_setting('app.current_vet_id', TRUE)::INT);

-- NOTA: Utiliza 'SET app.current_vet_id = N' al conectarte.
