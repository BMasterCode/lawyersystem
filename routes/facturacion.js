// routes/facturacion.js
const express = require('express');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();

// GET /api/facturacion/resumen -> cuánto ganó (cobrado) y cuánto le falta
// cobrar a cada abogado, sumando los honorarios de sus casos
router.get('/resumen', requireTipoCuenta('staff'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.nombre,
             COALESCE(SUM(h.monto) FILTER (WHERE h.estado_pago = 'pagado'), 0) AS ganado,
             COALESCE(SUM(h.monto) FILTER (WHERE h.estado_pago != 'pagado'), 0) AS pendiente
      FROM usuario u
      LEFT JOIN caso c ON c.abogado_responsable_id = u.id
      LEFT JOIN honorario h ON h.caso_id = c.id
      GROUP BY u.id, u.nombre
      ORDER BY u.nombre
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el resumen de facturación' });
  }
});

// GET /api/facturacion/honorarios -> lista completa de honorarios (todos los casos)
router.get('/honorarios', requireTipoCuenta('staff'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT h.id, h.concepto, h.monto, h.moneda, h.estado_pago, h.fecha,
             c.numero_expediente, u.nombre AS abogado
      FROM honorario h
      JOIN caso c ON c.id = h.caso_id
      JOIN usuario u ON u.id = c.abogado_responsable_id
      ORDER BY h.fecha DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los honorarios' });
  }
});

// POST /api/facturacion/honorarios -> registrar un honorario para un caso
router.post('/honorarios', requireTipoCuenta('staff'), async (req, res) => {
  const { caso_id, concepto, monto, moneda, estado_pago, fecha } = req.body;
  if (!caso_id || !concepto || !monto) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO honorario (caso_id, concepto, monto, moneda, estado_pago, fecha)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [caso_id, concepto, monto, moneda || 'BOB', estado_pago || 'pendiente', fecha || new Date()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar el honorario' });
  }
});

module.exports = router;
