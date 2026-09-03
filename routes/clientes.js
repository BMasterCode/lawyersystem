// routes/clientes.js
const express = require('express');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();

// GET /api/clientes -> lista con cantidad de casos y si tiene algo urgente
router.get('/', requireTipoCuenta('staff'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cl.id, cl.nombre_razon_social, cl.ci_nit, cl.telefono, cl.email, cl.codigo_acceso,
             COUNT(DISTINCT cc.caso_id) AS num_casos,
             BOOL_OR(p.estado = 'urgente') AS tiene_urgente
      FROM cliente cl
      LEFT JOIN caso_cliente cc ON cc.cliente_id = cl.id
      LEFT JOIN plazo p ON p.caso_id = cc.caso_id
      GROUP BY cl.id
      ORDER BY cl.nombre_razon_social
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los clientes' });
  }
});

// GET /api/clientes/:id -> datos del cliente + sus casos con urgencia
router.get('/:id', requireTipoCuenta('staff'), async (req, res) => {
  try {
    const cliente = await pool.query('SELECT * FROM cliente WHERE id = $1', [req.params.id]);
    if (cliente.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    const casos = await pool.query(
      `SELECT c.id, c.numero_expediente, c.materia, c.estado,
              (SELECT MIN(fecha_vencimiento_calculada) FROM plazo WHERE caso_id = c.id AND estado != 'cumplido') AS proximo_plazo,
              (SELECT estado FROM plazo WHERE caso_id = c.id AND estado != 'cumplido'
               ORDER BY fecha_vencimiento_calculada ASC LIMIT 1) AS urgencia
       FROM caso c
       JOIN caso_cliente cc ON cc.caso_id = c.id
       WHERE cc.cliente_id = $1
       ORDER BY c.fecha_inicio DESC`,
      [req.params.id]
    );

    res.json({ cliente: cliente.rows[0], casos: casos.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el cliente' });
  }
});

// PATCH /api/clientes/:id -> editar datos del cliente
router.patch('/:id', requireTipoCuenta('staff'), async (req, res) => {
  const { nombre_razon_social, ci_nit, telefono, email, canal_preferido } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE cliente SET
        nombre_razon_social = COALESCE($1, nombre_razon_social),
        ci_nit = COALESCE($2, ci_nit),
        telefono = COALESCE($3, telefono),
        email = COALESCE($4, email),
        canal_preferido = COALESCE($5, canal_preferido)
       WHERE id = $6 RETURNING *`,
      [nombre_razon_social, ci_nit, telefono, email, canal_preferido, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el cliente' });
  }
});

// DELETE /api/clientes/:id -> elimina el cliente (los casos NO se borran,
// solo se desvincula al cliente de ellos)
router.delete('/:id', requireTipoCuenta('staff'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM cliente WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ eliminado: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el cliente' });
  }
});

module.exports = router;
