-- =========================================================
-- LawyerSystem - Esquema de base de datos (PostgreSQL)
-- Basado en el diagrama ER del estudio juridico
-- =========================================================

-- Extension para generar UUIDs si prefieres usarlos en vez de SERIAL
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- TIPOS ENUM ----------
CREATE TYPE rol_usuario        AS ENUM ('socio', 'abogado', 'asistente', 'cliente');
CREATE TYPE tipo_cliente       AS ENUM ('natural', 'juridica');
CREATE TYPE canal_contacto     AS ENUM ('correo', 'telegram', 'whatsapp');
CREATE TYPE materia_caso       AS ENUM ('civil', 'penal', 'laboral', 'familia', 'coactivo_fiscal', 'otro');
CREATE TYPE moneda_tipo        AS ENUM ('BOB', 'USD');
CREATE TYPE estado_caso        AS ENUM ('en_tramite', 'con_audiencia', 'suspendido', 'archivado');
CREATE TYPE rol_en_caso        AS ENUM ('demandante', 'demandado', 'denunciante', 'otro');
CREATE TYPE tipo_documento     AS ENUM ('demanda', 'contestacion', 'prueba', 'poder', 'otro');
CREATE TYPE estado_plazo       AS ENUM ('en_plazo', 'proximo', 'urgente', 'vencido', 'cumplido');
CREATE TYPE estado_audiencia   AS ENUM ('programada', 'realizada', 'suspendida', 'reprogramada');
CREATE TYPE estado_pago        AS ENUM ('pendiente', 'parcial', 'pagado');
CREATE TYPE canal_notificacion AS ENUM ('correo', 'telegram', 'whatsapp');
CREATE TYPE estado_entrega     AS ENUM ('programado', 'enviado', 'fallido', 'leido');

-- ---------- USUARIO (abogados / staff que usan el sistema) ----------
CREATE TABLE usuario (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    telefono        VARCHAR(30),
    rol             rol_usuario NOT NULL,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- CLIENTE (personas/empresas que ven el portal) ----------
CREATE TABLE cliente (
    id                      SERIAL PRIMARY KEY,
    tipo                    tipo_cliente NOT NULL,
    nombre_razon_social     VARCHAR(200) NOT NULL,
    ci_nit                  VARCHAR(30) NOT NULL,
    departamento_emision    VARCHAR(50),   -- solo si tipo = natural (ej. LP, SC, CB)
    representante_legal     VARCHAR(150),  -- solo si tipo = juridica
    telefono                VARCHAR(30),
    email                   VARCHAR(150),
    password_hash           VARCHAR(255) NOT NULL, -- login al portal del cliente
    canal_preferido         canal_contacto NOT NULL DEFAULT 'correo',
    creado_en               TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- CASO ----------
CREATE TABLE caso (
    id                      SERIAL PRIMARY KEY,
    numero_expediente       VARCHAR(50) NOT NULL UNIQUE,
    materia                 materia_caso NOT NULL,
    departamento            VARCHAR(50),
    distrito_judicial       VARCHAR(100),
    juzgado_tribunal        VARCHAR(150),
    norma_aplicable_base    VARCHAR(200),
    contraparte              VARCHAR(200),
    cuantia                 DECIMAL(14,2),
    moneda                  moneda_tipo DEFAULT 'BOB',
    fecha_inicio            DATE NOT NULL,
    estado                  estado_caso NOT NULL DEFAULT 'en_tramite',
    abogado_responsable_id  INTEGER NOT NULL REFERENCES usuario(id)
);

-- ---------- CASO_CLIENTE (tabla puente N:M) ----------
CREATE TABLE caso_cliente (
    caso_id      INTEGER NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
    cliente_id   INTEGER NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
    rol_en_caso  rol_en_caso NOT NULL,
    PRIMARY KEY (caso_id, cliente_id)
);

-- ---------- DOCUMENTO ----------
CREATE TABLE documento (
    id                   SERIAL PRIMARY KEY,
    caso_id              INTEGER NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
    nombre_archivo       VARCHAR(255) NOT NULL,
    tipo_documento       tipo_documento NOT NULL,
    peso_kb              INTEGER,
    version              INTEGER NOT NULL DEFAULT 1,
    visible_en_portal    BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_subida         DATE NOT NULL DEFAULT CURRENT_DATE,
    subido_por_usuario_id INTEGER NOT NULL REFERENCES usuario(id)
);

-- ---------- FERIADO (se crea antes de PLAZO porque PLAZO no la referencia
-- directamente vía FK, el calculo se hace en la app, pero la dejamos lista) ----------
CREATE TABLE feriado (
    id            SERIAL PRIMARY KEY,
    fecha         DATE NOT NULL,
    departamento  VARCHAR(50), -- NULL = feriado nacional
    descripcion   VARCHAR(200)
);

-- ---------- PLAZO ----------
CREATE TABLE plazo (
    id                          SERIAL PRIMARY KEY,
    caso_id                     INTEGER NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
    tipo_plazo                  VARCHAR(150) NOT NULL,
    base_legal                  VARCHAR(200),
    fecha_inicio_computo        DATE NOT NULL,
    dias_habiles                INTEGER NOT NULL,
    fecha_vencimiento_calculada DATE NOT NULL,
    estado                      estado_plazo NOT NULL DEFAULT 'en_plazo'
);

-- ---------- AUDIENCIA ----------
CREATE TABLE audiencia (
    id              SERIAL PRIMARY KEY,
    caso_id         INTEGER NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
    fecha_hora      TIMESTAMP NOT NULL,
    tipo_audiencia  VARCHAR(150) NOT NULL,
    juzgado_sala    VARCHAR(150),
    estado          estado_audiencia NOT NULL DEFAULT 'programada'
);

-- ---------- HONORARIO ----------
CREATE TABLE honorario (
    id                  SERIAL PRIMARY KEY,
    caso_id             INTEGER NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
    concepto            VARCHAR(200) NOT NULL,
    monto               DECIMAL(12,2) NOT NULL,
    moneda              moneda_tipo NOT NULL DEFAULT 'BOB',
    estado_pago         estado_pago NOT NULL DEFAULT 'pendiente',
    factura_sin_numero  VARCHAR(50),
    fecha               DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ---------- GASTO ----------
CREATE TABLE gasto (
    id        SERIAL PRIMARY KEY,
    caso_id   INTEGER NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
    concepto  VARCHAR(150) NOT NULL, -- tasa_judicial | notificacion | movilidad | otro
    monto     DECIMAL(12,2) NOT NULL,
    fecha     DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ---------- BITACORA ----------
CREATE TABLE bitacora (
    id          SERIAL PRIMARY KEY,
    caso_id     INTEGER NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
    usuario_id  INTEGER NOT NULL REFERENCES usuario(id),
    accion      VARCHAR(150) NOT NULL,
    detalle     TEXT,
    fecha_hora  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- NOTIFICACION ----------
CREATE TABLE notificacion (
    id                     SERIAL PRIMARY KEY,
    caso_id                INTEGER NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
    cliente_id             INTEGER NOT NULL REFERENCES cliente(id),
    enviado_por_usuario_id INTEGER NOT NULL REFERENCES usuario(id),
    canal                  canal_notificacion NOT NULL,
    mensaje                TEXT NOT NULL,
    fecha_envio            TIMESTAMP,
    estado_entrega         estado_entrega NOT NULL DEFAULT 'programado'
);

-- ---------- Indices utiles para el dashboard y busquedas ----------
CREATE INDEX idx_caso_abogado        ON caso(abogado_responsable_id);
CREATE INDEX idx_caso_estado         ON caso(estado);
CREATE INDEX idx_plazo_caso          ON plazo(caso_id);
CREATE INDEX idx_plazo_estado_venc   ON plazo(estado, fecha_vencimiento_calculada);
CREATE INDEX idx_audiencia_fecha     ON audiencia(fecha_hora);
CREATE INDEX idx_documento_caso      ON documento(caso_id);
CREATE INDEX idx_bitacora_caso       ON bitacora(caso_id);
CREATE INDEX idx_notificacion_caso   ON notificacion(caso_id);
CREATE INDEX idx_cliente_ci_nit      ON cliente(ci_nit);

-- ---------- Tabla de sesiones para express-session + connect-pg-simple ----------
CREATE TABLE session (
    sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
    sess   JSON    NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
