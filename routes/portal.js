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

module.exports = router;
