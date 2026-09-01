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
// Si el CI ya existe como cliente, lo loguea y vincula el caso.
// Si no existe, avisa que es cliente nuevo (sin loguear todavía) para
// que el frontend pida nombre/correo/teléfono.
router.post('/cliente/verificar', async (req, res) => {
  const { ci_nit, codigo } = req.body;
  if (!ci_nit || !codigo) {
    return res.status(400).json({ error: 'Ingresá tu CI y el código' });
  }

  try {
    const caso = await pool.query(
      'SELECT id FROM caso WHERE codigo_vinculacion = $1',
      [codigo.trim().toUpperCase()]
    );
    if (caso.rowCount === 0) {
      return res.status(404).json({ error: 'El código no es válido' });
    }

    const cliente = await pool.query('SELECT * FROM cliente WHERE ci_nit = $1', [ci_nit.trim()]);

    if (cliente.rowCount === 0) {
      return res.json({ clienteNuevo: true });
    }

    const clienteRow = cliente.rows[0];
    const yaVinculado = await pool.query(
      'SELECT 1 FROM caso_cliente WHERE caso_id = $1 AND cliente_id = $2',
      [caso.rows[0].id, clienteRow.id]
    );
    if (yaVinculado.rowCount === 0) {
      await pool.query(
        'INSERT INTO caso_cliente (caso_id, cliente_id, rol_en_caso) VALUES ($1,$2,$3)',
        [caso.rows[0].id, clienteRow.id, 'otro']
      );
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

// POST /auth/cliente/registrar -> primera vez: crea el cliente y lo vincula
// { ci_nit, codigo, nombre, email, telefono }
router.post('/cliente/registrar', async (req, res) => {
  const { ci_nit, codigo, nombre, email, telefono } = req.body;
  if (!ci_nit || !codigo || !nombre) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const caso = await pool.query(
      'SELECT id FROM caso WHERE codigo_vinculacion = $1',
      [codigo.trim().toUpperCase()]
    );
    if (caso.rowCount === 0) {
      return res.status(404).json({ error: 'El código no es válido' });
    }

    const existe = await pool.query('SELECT id FROM cliente WHERE ci_nit = $1', [ci_nit.trim()]);
    if (existe.rowCount > 0) {
      return res.status(409).json({ error: 'Ese CI ya está registrado' });
    }

    const { rows } = await pool.query(
      `INSERT INTO cliente (tipo, nombre_razon_social, ci_nit, telefono, email, canal_preferido)
       VALUES ('natural',$1,$2,$3,$4,'correo') RETURNING id, nombre_razon_social`,
      [nombre, ci_nit.trim(), telefono || null, email || null]
    );

    await pool.query(
      'INSERT INTO caso_cliente (caso_id, cliente_id, rol_en_caso) VALUES ($1,$2,$3)',
      [caso.rows[0].id, rows[0].id, 'otro']
    );

    req.session.user = {
      id: rows[0].id,
      nombre: rows[0].nombre_razon_social,
      tipoCuenta: 'cliente',
    };
    res.status(201).json({ redirect: '/portal.html' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear tu cuenta' });
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
