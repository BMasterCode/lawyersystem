// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');

const router = express.Router();

// ============ ABOGADO / STAFF ============

// POST /auth/login  -> { ci, password }
router.post('/login', async (req, res) => {
  const { ci, password } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, ci, email, password_hash, rol, activo FROM usuario WHERE ci = $1',
      [ci]
    );
    const usuario = rows[0];
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'CI o contraseña incorrectos' });
    }
    const ok = await bcrypt.compare(password, usuario.password_hash);
    if (!ok) return res.status(401).json({ error: 'CI o contraseña incorrectos' });

    req.session.user = {
      id: usuario.id,
      nombre: usuario.nombre,
      ci: usuario.ci,
      email: usuario.email,
      rol: usuario.rol,
      tipoCuenta: 'staff',
    };
    res.json({ redirect: '/dashboard.html' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /auth/registro -> crear cuenta de abogado
// { nombre, ci, email, telefono, rol, password }
router.post('/registro', async (req, res) => {
  const { nombre, ci, email, telefono, rol, password } = req.body;

  if (!nombre || !ci || !email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const existeCi = await pool.query('SELECT id FROM usuario WHERE ci = $1', [ci]);
    if (existeCi.rowCount > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese CI' });
    }
    const existeEmail = await pool.query('SELECT id FROM usuario WHERE email = $1', [email]);
    if (existeEmail.rowCount > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuario (nombre, ci, email, telefono, password_hash, rol)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, nombre, ci, email, rol`,
      [nombre, ci, email, telefono || null, password_hash, rol]
    );

    req.session.user = {
      id: rows[0].id,
      nombre: rows[0].nombre,
      ci: rows[0].ci,
      email: rows[0].email,
      rol: rows[0].rol,
      tipoCuenta: 'staff',
    };
    res.status(201).json({ redirect: '/dashboard.html' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

// ============ CLIENTE (sin contraseña: CI + código) ============

// POST /auth/cliente/verificar -> { ci_nit, codigo }
// Busca el cliente por su código de acceso (uno solo por persona, agrupa
// todos sus casos). Si el CI todavía no está registrado en esa cuenta,
// es su primera vez y falta completar el perfil.
router.post('/cliente/verificar', async (req, res) => {
  const { ci_nit, codigo } = req.body;
  if (!ci_nit || !codigo) {
    return res.status(400).json({ error: 'Ingresá tu CI y el código' });
  }

  try {
    const cliente = await pool.query(
      'SELECT * FROM cliente WHERE codigo_acceso = $1',
      [codigo.trim().toUpperCase()]
    );
    if (cliente.rowCount === 0) {
      return res.status(404).json({ error: 'El código no es válido' });
    }
    const clienteRow = cliente.rows[0];

    if (!clienteRow.ci_nit) {
      // Primera vez que se usa este código: el nombre ya lo puso el abogado
      return res.json({ clienteNuevo: true, nombre: clienteRow.nombre_razon_social });
    }

    if (clienteRow.ci_nit !== ci_nit.trim()) {
      return res.status(403).json({ error: 'Ese código ya pertenece a otra persona. Revisá tu CI.' });
    }

    req.session.user = {
      id: clienteRow.id,
      nombre: clienteRow.nombre_razon_social,
      tipoCuenta: 'cliente',
    };
    res.json({ clienteNuevo: false, redirect: '/portal.html' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al verificar tus datos' });
  }
});

// POST /auth/cliente/registrar -> primera vez: completa CI, correo y teléfono
// { ci_nit, codigo, email, telefono }  (el nombre ya lo cargó el abogado)
router.post('/cliente/registrar', async (req, res) => {
  const { ci_nit, codigo, email, telefono } = req.body;
  if (!ci_nit || !codigo) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const cliente = await pool.query(
      'SELECT * FROM cliente WHERE codigo_acceso = $1',
      [codigo.trim().toUpperCase()]
    );
    if (cliente.rowCount === 0) {
      return res.status(404).json({ error: 'El código no es válido' });
    }
    if (cliente.rows[0].ci_nit) {
      return res.status(409).json({ error: 'Este código ya fue registrado antes' });
    }

    const ciExistente = await pool.query('SELECT id FROM cliente WHERE ci_nit = $1', [ci_nit.trim()]);
    if (ciExistente.rowCount > 0) {
      return res.status(409).json({ error: 'Ese CI ya está en uso por otra cuenta' });
    }

    const { rows } = await pool.query(
      `UPDATE cliente SET ci_nit = $1, email = $2, telefono = $3
       WHERE id = $4 RETURNING id, nombre_razon_social`,
      [ci_nit.trim(), email || null, telefono || null, cliente.rows[0].id]
    );

    req.session.user = {
      id: rows[0].id,
      nombre: rows[0].nombre_razon_social,
      tipoCuenta: 'cliente',
    };
    res.status(201).json({ redirect: '/portal.html' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al completar tu registro' });
  }
});

// ============ COMUNES ============

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/entrada.html');
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ user: null });
  res.json({ user: req.session.user });
});

module.exports = router;
