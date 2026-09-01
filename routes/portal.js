// routes/portal.js
const express = require('express');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();

// GET /api/portal/mis-casos -> casos vinculados al cliente logueado
router.get('/mis-casos', requireTipoCuenta('cliente'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.numero_expediente, c.materia, c.estado, c.juzgado_tribunal,
              cc.rol_en_caso
       FROM caso c
       JOIN caso_cliente cc ON cc.caso_id = c.id
       WHERE cc.cliente_id = $1
       ORDER BY c.fecha_inicio DESC`,
      [req.session.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tus casos' });
  }
});

// POST /api/portal/vincular -> el cliente ingresa el código que le pasó
// su abogado y queda vinculado a ese caso
router.post('/vincular', requireTipoCuenta('cliente'), async (req, res) => {
  const { codigo, rol_en_caso } = req.body;
  if (!codigo) return res.status(400).json({ error: 'Ingresá el código del caso' });

  try {
    const caso = await pool.query(
      'SELECT id, numero_expediente FROM caso WHERE codigo_vinculacion = $1',
      [codigo.trim().toUpperCase()]
    );
    if (caso.rowCount === 0) {
      return res.status(404).json({ error: 'Código inválido, revisá que esté bien escrito' });
    }

    const yaVinculado = await pool.query(
      'SELECT 1 FROM caso_cliente WHERE caso_id = $1 AND cliente_id = $2',
      [caso.rows[0].id, req.session.user.id]
    );
    if (yaVinculado.rowCount > 0) {
      return res.status(409).json({ error: 'Ese caso ya está en tu panel' });
    }

    await pool.query(
      'INSERT INTO caso_cliente (caso_id, cliente_id, rol_en_caso) VALUES ($1,$2,$3)',
      [caso.rows[0].id, req.session.user.id, rol_en_caso || 'otro']
    );

    res.status(201).json({ numero_expediente: caso.rows[0].numero_expediente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al vincular el caso' });
  }
});

module.exports = router;
