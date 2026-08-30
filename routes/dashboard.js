// routes/dashboard.js
const express = require('express');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();

router.get('/kpis', requireTipoCuenta('staff'), async (req, res) => {
  try {
    const casosActivos = await pool.query(
      "SELECT COUNT(*) FROM caso WHERE estado != 'archivado'"
    );
    const plazosProximos = await pool.query(
      "SELECT COUNT(*) FROM plazo WHERE estado IN ('proximo','urgente') AND fecha_vencimiento_calculada <= CURRENT_DATE + INTERVAL '7 days'"
    );
    const audienciasHoy = await pool.query(
      "SELECT COUNT(*) FROM audiencia WHERE fecha_hora::date = CURRENT_DATE AND estado = 'programada'"
    );
    const honorariosPorCobrar = await pool.query(
      "SELECT COALESCE(SUM(monto),0) AS total FROM honorario WHERE estado_pago != 'pagado'"
    );

    res.json({
      casos_activos: Number(casosActivos.rows[0].count),
      plazos_proximos: Number(plazosProximos.rows[0].count),
      audiencias_hoy: Number(audienciasHoy.rows[0].count),
      honorarios_por_cobrar: Number(honorariosPorCobrar.rows[0].total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los KPIs' });
  }
});

module.exports = router;
