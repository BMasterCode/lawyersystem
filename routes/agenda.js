// routes/agenda.js
const express = require('express');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();

// GET /api/agenda?year=2026&month=9  -> audiencias y plazos de ese mes,
// con el nombre del cliente, para pintar el calendario
router.get('/', requireTipoCuenta('staff'), async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10); // 1-12

  if (!year || !month) return res.status(400).json({ error: 'Faltan year y month' });

  try {
    const audiencias = await pool.query(
      `SELECT a.id, a.fecha_hora, a.tipo_audiencia, a.juzgado_sala, a.estado,
              c.id AS caso_id, c.numero_expediente,
              (SELECT string_agg(cl.nombre_razon_social, ', ')
               FROM caso_cliente cc JOIN cliente cl ON cl.id = cc.cliente_id
               WHERE cc.caso_id = c.id) AS cliente
       FROM audiencia a
       JOIN caso c ON c.id = a.caso_id
       WHERE EXTRACT(YEAR FROM a.fecha_hora) = $1 AND EXTRACT(MONTH FROM a.fecha_hora) = $2
       ORDER BY a.fecha_hora`,
      [year, month]
    );

    const plazos = await pool.query(
      `SELECT p.id, p.fecha_vencimiento_calculada, p.tipo_plazo, p.estado,
              c.id AS caso_id, c.numero_expediente,
              (SELECT string_agg(cl.nombre_razon_social, ', ')
               FROM caso_cliente cc JOIN cliente cl ON cl.id = cc.cliente_id
               WHERE cc.caso_id = c.id) AS cliente
       FROM plazo p
       JOIN caso c ON c.id = p.caso_id
       WHERE EXTRACT(YEAR FROM p.fecha_vencimiento_calculada) = $1
         AND EXTRACT(MONTH FROM p.fecha_vencimiento_calculada) = $2
       ORDER BY p.fecha_vencimiento_calculada`,
      [year, month]
    );

    res.json({ audiencias: audiencias.rows, plazos: plazos.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener la agenda' });
  }
});

// GET /api/agenda/dia?fecha=2026-09-03 -> audiencias y plazos de ese día,
// con hora de inicio y fin, para la vista de horario del día
router.get('/dia', requireTipoCuenta('staff'), async (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.status(400).json({ error: 'Falta la fecha' });

  try {
    const audiencias = await pool.query(
      `SELECT a.id, a.fecha_hora, a.hora_fin, a.tipo_audiencia, a.juzgado_sala, a.estado,
              c.id AS caso_id, c.numero_expediente,
              (SELECT string_agg(cl.nombre_razon_social, ', ')
               FROM caso_cliente cc JOIN cliente cl ON cl.id = cc.cliente_id
               WHERE cc.caso_id = c.id) AS cliente
       FROM audiencia a
       JOIN caso c ON c.id = a.caso_id
       WHERE a.fecha_hora::date = $1::date
       ORDER BY a.fecha_hora`,
      [fecha]
    );

    const plazos = await pool.query(
      `SELECT p.id, p.tipo_plazo, p.estado,
              c.id AS caso_id, c.numero_expediente,
              (SELECT string_agg(cl.nombre_razon_social, ', ')
               FROM caso_cliente cc JOIN cliente cl ON cl.id = cc.cliente_id
               WHERE cc.caso_id = c.id) AS cliente
       FROM plazo p
       JOIN caso c ON c.id = p.caso_id
       WHERE p.fecha_vencimiento_calculada = $1::date`,
      [fecha]
    );

    res.json({ audiencias: audiencias.rows, plazos: plazos.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el día' });
  }
});

module.exports = router;
