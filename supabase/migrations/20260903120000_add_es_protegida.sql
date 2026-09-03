ALTER TABLE case_rules ADD COLUMN es_protegida boolean not null default false;
ALTER TABLE message_categories ADD COLUMN es_protegida boolean not null default false;

CREATE UNIQUE INDEX idx_categoria_fallback_unica ON message_categories (branch_id) WHERE es_fallback = true;
CREATE UNIQUE INDEX idx_regla_documento_unica ON case_rules (branch_id) WHERE tipo_caso = 'documento_no_procesable';
CREATE UNIQUE INDEX idx_regla_derivacion_unica ON case_rules (branch_id) WHERE tipo_caso = 'derivacion_solicitada';
