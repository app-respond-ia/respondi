-- 1. Añadir columnas a users para restaurar organización
ALTER TABLE public.users
ADD COLUMN prev_tenant_id uuid REFERENCES public.organizaciones(id) ON DELETE SET NULL,
ADD COLUMN prev_branch_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;

-- 2. Crear función RPC atómica
CREATE OR REPLACE FUNCTION public.cambiar_rol_usuario_global(
  p_user_id uuid,
  p_nuevo_rol public.rol_usuario
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_nuevo_rol = 'vendedor' THEN
    -- Actualizar usuario y guardar sus IDs anteriores (preservando el historial si ya estaba)
    UPDATE public.users 
    SET rol = 'vendedor',
        prev_tenant_id = COALESCE(tenant_id, prev_tenant_id),
        prev_branch_id = COALESCE(branch_id, prev_branch_id),
        tenant_id = NULL,
        branch_id = NULL
    WHERE id = p_user_id;

    -- Insertar o actualizar en vendedores de forma segura (UPSERT por email)
    INSERT INTO public.vendedores (user_id, nombre, email, activo)
    SELECT id, COALESCE(nombre, email), email, true
    FROM public.users WHERE id = p_user_id
    ON CONFLICT (email) DO UPDATE 
    SET user_id = EXCLUDED.user_id,
        activo = true,
        nombre = COALESCE(vendedores.nombre, EXCLUDED.nombre);

  ELSIF p_nuevo_rol = 'tenant_user' THEN
    -- Restaurar IDs anteriores y limpiar el historial
    UPDATE public.users 
    SET rol = 'tenant_user',
        tenant_id = prev_tenant_id,
        branch_id = prev_branch_id,
        prev_tenant_id = NULL,
        prev_branch_id = NULL
    WHERE id = p_user_id;
    
    -- Desactivar cuenta de vendedor si existe para que deje de generar comisiones
    UPDATE public.vendedores
    SET activo = false
    WHERE user_id = p_user_id;

  ELSE
    -- Para otros roles
    UPDATE public.users SET rol = p_nuevo_rol WHERE id = p_user_id;
  END IF;
END;
$$;

-- 3. Configurar permisos de seguridad (solo accesible vía backend/service_role)
REVOKE ALL ON FUNCTION public.cambiar_rol_usuario_global(uuid, public.rol_usuario) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cambiar_rol_usuario_global(uuid, public.rol_usuario) FROM authenticated;
REVOKE ALL ON FUNCTION public.cambiar_rol_usuario_global(uuid, public.rol_usuario) FROM anon;
GRANT EXECUTE ON FUNCTION public.cambiar_rol_usuario_global(uuid, public.rol_usuario) TO service_role;
