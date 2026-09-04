// routes/adminApi.js
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();
router.use(requireTipoCuenta('admin'));

// ---------- Abogados ----------

router.get('/abogados', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, ci, email, telefono, rol, activo FROM usuario ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los abogados' });
  }
});

// El admin es el único que puede dar de alta abogados/asistentes/socios
router.post('/abogados', async (req, res) => {
  const { nombre, ci, email, telefono, rol, password } = req.body;
  if (!nombre || !ci || !email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  try {
    const existeCi = await pool.query('SELECT id FROM usuario WHERE ci = $1', [ci]);
    if (existeCi.rowCount > 0) return res.status(409).json({ error: 'Ya existe una cuenta con ese CI' });

    const existeEmail = await pool.query('SELECT id FROM usuario WHERE email = $1', [email]);
    if (existeEmail.rowCount > 0) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });

    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuario (nombre, ci, email, telefono, password_hash, rol)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, nombre, ci, email, rol, activo`,
      [nombre, ci, email, telefono || null, password_hash, rol]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el abogado' });
  }
});

// Activar/desactivar un abogado (en vez de borrarlo, para no perder el historial de sus casos)
router.patch('/abogados/:id/estado', async (req, res) => {
  const { activo } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE usuario SET activo = $1 WHERE id = $2 RETURNING id, activo',
      [activo, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el abogado' });
  }
});

// ---------- Clientes ----------

router.get('/clientes', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cl.id, cl.nombre_razon_social, cl.ci_nit, cl.telefono, cl.plan, cl.codigo_acceso,
             COUNT(DISTINCT cc.caso_id) AS num_casos
      FROM cliente cl
      LEFT JOIN caso_cliente cc ON cc.cliente_id = cl.id
      GROUP BY cl.id
      ORDER BY cl.nombre_razon_social
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los clientes' });
  }
});

// Cambiar el plan de un cliente (normal <-> premium)
router.patch('/clientes/:id/plan', async (req, res) => {
  const { plan } = req.body;
  if (!['normal', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Plan inválido' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE cliente SET plan = $1 WHERE id = $2 RETURNING id, nombre_razon_social, plan',
      [plan, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el plan' });
  }
});

// ---------- Reportes globales ----------

router.get('/reportes', async (req, res) => {
  try {
    const porAbogado = await pool.query(`
      SELECT u.id, u.nombre,
             COUNT(c.id) AS total_casos,
             COUNT(c.id) FILTER (WHERE c.fecha_inicio >= date_trunc('week', CURRENT_DATE)) AS casos_esta_semana,
             COUNT(c.id) FILTER (WHERE c.fecha_inicio >= date_trunc('month', CURRENT_DATE)) AS casos_este_mes
      FROM usuario u
      LEFT JOIN caso c ON c.abogado_responsable_id = u.id
      GROUP BY u.id, u.nombre
      ORDER BY u.nombre
    `);

    const totales = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM caso) AS total_casos,
        (SELECT COUNT(*) FROM caso WHERE estado != 'archivado') AS casos_activos,
        (SELECT COUNT(*) FROM cliente) AS total_clientes,
        (SELECT COUNT(*) FROM cliente WHERE plan = 'premium') AS clientes_premium
    `);

    res.json({ porAbogado: porAbogado.rows, totales: totales.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar el reporte' });
  }
});

module.exports = router;
