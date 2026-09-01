// routes/casos.js
const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();

// Genera un código corto y fácil de dictar/copiar, ej. "F3K9-QX2P"
function generarCodigoVinculacion() {
  const bloque = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${bloque()}-${bloque()}`;
}

// GET /api/casos  -> lista de casos (solo staff)
router.get('/', requireTipoCuenta('staff'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.numero_expediente, c.materia, c.distrito_judicial,
             c.juzgado_tribunal, c.estado, c.contraparte,
             u.nombre AS abogado_responsable,
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
    if (user.tipoCuenta === 'cliente') {
      const vinculo = await pool.query(
        'SELECT 1 FROM caso_cliente WHERE caso_id = $1 AND cliente_id = $2',
        [id, user.id]
      );
      if (vinculo.rowCount === 0) {
        return res.status(403).json({ error: 'No tenes acceso a este caso' });
      }
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
    // El portal del cliente solo debe ver documentos marcados visible_en_portal
    const documentosQuery =
      user.tipoCuenta === 'cliente'
        ? 'SELECT id, nombre_archivo, tipo_documento, fecha_subida FROM documento WHERE caso_id = $1 AND visible_en_portal = TRUE ORDER BY fecha_subida DESC'
        : 'SELECT * FROM documento WHERE caso_id = $1 ORDER BY fecha_subida DESC';
    const documentos = await pool.query(documentosQuery, [id]);

    res.json({
      caso: caso.rows[0],
      plazos: plazos.rows,
      audiencias: audiencias.rows,
      documentos: documentos.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el detalle del caso' });
  }
});

// POST /api/casos -> crear caso nuevo (solo staff)
router.post('/', requireTipoCuenta('staff'), async (req, res) => {
  const {
    numero_expediente, materia, departamento, distrito_judicial,
    juzgado_tribunal, norma_aplicable_base, contraparte, cuantia,
    moneda, fecha_inicio,
  } = req.body;

  const codigo_vinculacion = generarCodigoVinculacion();

  try {
    const { rows } = await pool.query(
      `INSERT INTO caso
        (numero_expediente, materia, departamento, distrito_judicial,
         juzgado_tribunal, norma_aplicable_base, contraparte, cuantia,
         moneda, fecha_inicio, abogado_responsable_id, codigo_vinculacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [numero_expediente, materia, departamento, distrito_judicial,
        juzgado_tribunal, norma_aplicable_base, contraparte, cuantia,
        moneda || 'BOB', fecha_inicio, req.session.user.id, codigo_vinculacion]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el caso' });
  }
});

module.exports = router;
