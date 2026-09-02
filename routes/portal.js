// routes/portal.js
const express = require('express');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();

// GET /api/portal/mis-casos -> todos los casos vinculados al cliente logueado
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

// POST /api/portal/vincular -> agrega los casos de otro código de cliente
// a la cuenta ya logueada (ej. el abogado te cargó dos veces, o tenés un
// código de otro caso distinto)
router.post('/vincular', requireTipoCuenta('cliente'), async (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ error: 'Ingresá el código' });

  try {
    const otroCliente = await pool.query(
      'SELECT id FROM cliente WHERE codigo_acceso = $1',
      [codigo.trim().toUpperCase()]
    );
    if (otroCliente.rowCount === 0) {
      return res.status(404).json({ error: 'Código inválido, revisá que esté bien escrito' });
    }
    if (otroCliente.rows[0].id === req.session.user.id) {
      return res.status(409).json({ error: 'Ese código ya es el tuyo' });
    }

    const resultado = await pool.query(
      `INSERT INTO caso_cliente (caso_id, cliente_id, rol_en_caso)
       SELECT caso_id, $1, rol_en_caso
       FROM caso_cliente WHERE cliente_id = $2
       ON CONFLICT (caso_id, cliente_id) DO NOTHING`,
      [req.session.user.id, otroCliente.rows[0].id]
    );

    res.status(201).json({ casosAgregados: resultado.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al vincular el código' });
  }
});

module.exports = router;
