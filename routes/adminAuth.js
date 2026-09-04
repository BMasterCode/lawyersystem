// routes/adminAuth.js
const express = require('express');
const router = express.Router();

// POST /admin/login -> compara contra el usuario/contraseña únicos del .env
router.post('/login', (req, res) => {
  const { usuario, password } = req.body;
  if (usuario === process.env.ADMIN_USER && password === process.env.ADMIN_PASSWORD) {
    req.session.user = { tipoCuenta: 'admin', nombre: 'Administrador' };
    return res.json({ redirect: '/admin-panel.html' });
  }
  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

module.exports = router;
