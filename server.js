// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');

const pool = require('./db/pool');
const authRoutes = require('./routes/auth');
const casosRoutes = require('./routes/casos');
const documentosRoutes = require('./routes/documentos');
const dashboardRoutes = require('./routes/dashboard');
const portalRoutes = require('./routes/portal');
const agendaRoutes = require('./routes/agenda');
const clientesRoutes = require('./routes/clientes');
const facturacionRoutes = require('./routes/facturacion');
const adminAuthRoutes = require('./routes/adminAuth');
const adminApiRoutes = require('./routes/adminApi');
const { iniciarRecordatoriosDiarios } = require('./jobs/recordatorios');
const { requireLogin } = require('./middleware/auth');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'cambia-esto',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 8 * 60 * 60 * 1000, // 8 horas
      httpOnly: true,
    },
  })
);

// Ruta raíz: pantalla para elegir "abogado" o "cliente"
app.get('/', (req, res) => {
  res.redirect('/entrada.html');
});

// /admin no está linkeado desde ningún lado del sitio público a propósito
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// El panel de admin solo lo puede ver quien inició sesión como admin
app.get('/admin-panel.html', (req, res, next) => {
  if (!req.session.user || req.session.user.tipoCuenta !== 'admin') {
    return res.redirect('/admin');
  }
  next();
});

// API
app.use('/auth', authRoutes);
app.use('/api/casos', casosRoutes);
app.use('/api/casos', documentosRoutes); // /api/casos/:casoId/documentos (subir)
app.use('/api/documentos', documentosRoutes); // /api/documentos/:id/descargar
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/agenda', agendaRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/facturacion', facturacionRoutes);
app.use('/admin', adminAuthRoutes);
app.use('/api/admin', adminApiRoutes);

// Paginas que requieren sesion iniciada (protegemos el HTML tambien,
// no solo la API, para que nadie vea la pantalla sin loguearse)
app.get(['/dashboard.html', '/casos.html', '/detalle.html', '/portal.html', '/nuevo-caso.html', '/agenda.html', '/dia.html', '/clientes.html', '/facturacion.html'], requireLogin);

// Archivos estaticos (css, js, html) al final para que las rutas de arriba
// tengan prioridad
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LawyerSystem corriendo en http://localhost:${PORT}`);
  iniciarRecordatoriosDiarios();
});
