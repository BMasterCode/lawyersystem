// routes/casos.js
const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();

// Genera un código corto y fácil de dictar/copiar, ej. "F3K9-QX2P"
function generarCodigo() {
  const bloque = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${bloque()}-${bloque()}`;
}

// GET /api/casos  -> lista de casos (solo staff), con el nombre del cliente
router.get('/', requireTipoCuenta('staff'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.numero_expediente, c.materia, c.distrito_judicial,
             c.juzgado_tribunal, c.estado, c.contraparte,
             u.nombre AS abogado_responsable,
             (
               SELECT string_agg(cl.nombre_razon_social, ', ')
               FROM caso_cliente cc
               JOIN cliente cl ON cl.id = cc.cliente_id
               WHERE cc.caso_id = c.id
             ) AS cliente,
             (
               SELECT MIN(p.fecha_vencimiento_calculada)
               FROM plazo p
               WHERE p.caso_id = c.id AND p.estado != 'cumplido'
             ) AS proximo_plazo
      FROM caso c
      JOIN usuario u ON u.id = c.abogado_responsable_id
      ORDER BY proximo_plazo NULLS LAST
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener casos' });
  }
});

// GET /api/casos/:id -> detalle de un caso (staff, o el cliente vinculado a el)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  try {
    let esPremium = false;
    if (user.tipoCuenta === 'cliente') {
      const vinculo = await pool.query(
        'SELECT 1 FROM caso_cliente WHERE caso_id = $1 AND cliente_id = $2',
        [id, user.id]
      );
      if (vinculo.rowCount === 0) {
        return res.status(403).json({ error: 'No tenes acceso a este caso' });
      }
      const clienteInfo = await pool.query('SELECT plan FROM cliente WHERE id = $1', [user.id]);
      esPremium = clienteInfo.rows[0]?.plan === 'premium';
    }

    const caso = await pool.query('SELECT * FROM caso WHERE id = $1', [id]);
    if (caso.rowCount === 0) return res.status(404).json({ error: 'Caso no encontrado' });

    const plazos = await pool.query(
      'SELECT * FROM plazo WHERE caso_id = $1 ORDER BY fecha_vencimiento_calculada',
      [id]
    );
    const audiencias = await pool.query(
      'SELECT * FROM audiencia WHERE caso_id = $1 ORDER BY fecha_hora',
      [id]
    );

    // Documentos: el staff ve todo. El cliente premium ve los marcados
    // visible_en_portal. El cliente normal no ve documentos (solo el
    // estado del caso) — ese es el beneficio de la suscripción premium.
    let documentos = { rows: [] };
    if (user.tipoCuenta === 'staff') {
      documentos = await pool.query('SELECT * FROM documento WHERE caso_id = $1 ORDER BY fecha_subida DESC', [id]);
    } else if (esPremium) {
      documentos = await pool.query(
        'SELECT id, nombre_archivo, tipo_documento, fecha_subida FROM documento WHERE caso_id = $1 AND visible_en_portal = TRUE ORDER BY fecha_subida DESC',
        [id]
      );
    }

    const clientes = await pool.query(
      `SELECT cl.id, cl.nombre_razon_social, cl.codigo_acceso, cc.rol_en_caso
       FROM caso_cliente cc JOIN cliente cl ON cl.id = cc.cliente_id
       WHERE cc.caso_id = $1`,
      [id]
    );

    res.json({
      caso: caso.rows[0],
      plazos: plazos.rows,
      audiencias: audiencias.rows,
      documentos: documentos.rows,
      // El código de acceso solo se manda si quien pregunta es staff
      clientes: user.tipoCuenta === 'staff' ? clientes.rows : undefined,
      esPremium: user.tipoCuenta === 'cliente' ? esPremium : undefined,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el detalle del caso' });
  }
});

// POST /api/casos -> crear caso nuevo (solo staff)
// Recibe además "nombre_cliente": si ya existe un cliente con ese nombre,
// reutiliza su código de acceso; si no, crea el cliente y genera uno nuevo.
router.post('/', requireTipoCuenta('staff'), async (req, res) => {
  const {
    numero_expediente, materia, departamento, distrito_judicial,
    juzgado_tribunal, norma_aplicable_base, contraparte, cuantia,
    moneda, fecha_inicio, nombre_cliente,
  } = req.body;

  if (!nombre_cliente || !nombre_cliente.trim()) {
    return res.status(400).json({ error: 'Ingresá el nombre del cliente que contrata' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let clienteId, codigoAcceso, clienteReutilizado;

    const existente = await client.query(
      'SELECT id, codigo_acceso FROM cliente WHERE LOWER(nombre_razon_social) = LOWER($1)',
      [nombre_cliente.trim()]
    );

    if (existente.rowCount > 0) {
      clienteId = existente.rows[0].id;
      codigoAcceso = existente.rows[0].codigo_acceso;
      clienteReutilizado = true;
    } else {
      codigoAcceso = generarCodigo();
      const nuevoCliente = await client.query(
        `INSERT INTO cliente (tipo, nombre_razon_social, canal_preferido, codigo_acceso)
         VALUES ('natural', $1, 'correo', $2) RETURNING id`,
        [nombre_cliente.trim(), codigoAcceso]
      );
      clienteId = nuevoCliente.rows[0].id;
      clienteReutilizado = false;
    }

    const nuevoCaso = await client.query(
      `INSERT INTO caso
        (numero_expediente, materia, departamento, distrito_judicial,
         juzgado_tribunal, norma_aplicable_base, contraparte, cuantia,
         moneda, fecha_inicio, abogado_responsable_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [numero_expediente, materia, departamento, distrito_judicial,
        juzgado_tribunal, norma_aplicable_base, contraparte, cuantia,
        moneda || 'BOB', fecha_inicio, req.session.user.id]
    );

    await client.query(
      'INSERT INTO caso_cliente (caso_id, cliente_id, rol_en_caso) VALUES ($1,$2,$3)',
      [nuevoCaso.rows[0].id, clienteId, 'otro']
    );

    await client.query('COMMIT');

    res.status(201).json({
      ...nuevoCaso.rows[0],
      codigo_acceso: codigoAcceso,
      cliente_reutilizado: clienteReutilizado,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al crear el caso' });
  } finally {
    client.release();
  }
});

// POST /api/casos/:id/plazos -> agregar un plazo (solo staff)
router.post('/:id/plazos', requireTipoCuenta('staff'), async (req, res) => {
  const { id } = req.params;
  const { tipo_plazo, base_legal, fecha_inicio_computo, dias_habiles, fecha_vencimiento_calculada, estado } = req.body;

  if (!tipo_plazo || !fecha_vencimiento_calculada) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO plazo
        (caso_id, tipo_plazo, base_legal, fecha_inicio_computo, dias_habiles, fecha_vencimiento_calculada, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, tipo_plazo, base_legal || null, fecha_inicio_computo || null,
        dias_habiles || null, fecha_vencimiento_calculada, estado || 'en_plazo']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al agregar el plazo' });
  }
});

// POST /api/casos/:id/audiencias -> agregar una audiencia (solo staff)
router.post('/:id/audiencias', requireTipoCuenta('staff'), async (req, res) => {
  const { id } = req.params;
  const { fecha_hora, hora_fin, tipo_audiencia, juzgado_sala, estado } = req.body;

  if (!fecha_hora || !tipo_audiencia) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO audiencia (caso_id, fecha_hora, hora_fin, tipo_audiencia, juzgado_sala, estado)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, fecha_hora, hora_fin || null, tipo_audiencia, juzgado_sala || null, estado || 'programada']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al agregar la audiencia' });
  }
});

// PATCH /api/casos/:id/estado -> cambiar el estado (ej. terminar/archivar) (solo staff)
router.patch('/:id/estado', requireTipoCuenta('staff'), async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const validos = ['en_tramite', 'con_audiencia', 'suspendido', 'archivado'];
  if (!validos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE caso SET estado = $1 WHERE id = $2 RETURNING id, estado',
      [estado, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el estado' });
  }
});

// DELETE /api/casos/:id -> eliminar un caso y todo lo relacionado (solo staff)
router.delete('/:id', requireTipoCuenta('staff'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM caso WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    res.json({ eliminado: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el caso' });
  }
});

module.exports = router;
