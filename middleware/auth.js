// middleware/auth.js

// Exige que haya una sesion iniciada (abogado/staff o cliente)
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login.html');
  }
  next();
}

// Exige que el usuario en sesion sea del "tipoCuenta" indicado:
// 'staff'  -> socio | abogado | asistente (usan el panel interno)
// 'cliente' -> usa el portal del cliente
function requireTipoCuenta(tipoCuenta) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login.html');
    }
    if (req.session.user.tipoCuenta !== tipoCuenta) {
      return res.status(403).send('No tenes permiso para ver esta seccion.');
    }
    next();
  };
}

// Exige uno de varios roles internos especificos (ej. solo 'socio')
function requireRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login.html');
    }
    if (
      req.session.user.tipoCuenta !== 'staff' ||
      !rolesPermitidos.includes(req.session.user.rol)
    ) {
      return res.status(403).send('No tenes permiso para ver esta seccion.');
    }
    next();
  };
}

module.exports = { requireLogin, requireTipoCuenta, requireRol };
