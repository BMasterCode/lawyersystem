// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');

const router = express.Router();

// POST /auth/login
// El formulario de login.html manda { email, password, tipoCuenta }
// tipoCuenta = 'staff' (abogado/socio/asistente) o 'cliente'
router.post('/login', async (req, res) => {
  const { email, password, tipoCuenta } = req.body;

  try {
    if (tipoCuenta === 'staff') {
      const { rows } = await pool.query(
        'SELECT id, nombre, email, password_hash, rol, activo FROM usuario WHERE email = $1',
        [email]
      );
      const usuario = rows[0];
      if (!usuario || !usuario.activo) {
        return res.status(401).json({ error: 'Credenciales invalidas' });
      }
      const ok = await bcrypt.compare(password, usuario.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciales invalidas' });

      req.session.user = {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        tipoCuenta: 'staff',
      };
      return res.json({ redirect: '/dashboard.html' });
    }

    if (tipoCuenta === 'cliente') {
      const { rows } = await pool.query(
        'SELECT id, nombre_razon_social, email, password_hash FROM cliente WHERE email = $1',
        [email]
      );
      const cliente = rows[0];
      if (!cliente) return res.status(401).json({ error: 'Credenciales invalidas' });

      const ok = await bcrypt.compare(password, cliente.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciales invalidas' });

      req.session.user = {
        id: cliente.id,
        nombre: cliente.nombre_razon_social,
        email: cliente.email,
        tipoCuenta: 'cliente',
      };
      return res.json({ redirect: '/portal.html' });
    }

    return res.status(400).json({ error: 'tipoCuenta invalido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

// Endpoint que el frontend usa para saber quien esta logueado
// y armar el sidebar segun el rol
router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ user: null });
  res.json({ user: req.session.user });
});

module.exports = router;
