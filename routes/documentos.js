// routes/documentos.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const { requireTipoCuenta } = require('../middleware/auth');

const router = express.Router();

// Los archivos NO van en /public: si estuvieran ahí, cualquiera con el
// link podría abrirlos sin pasar por el control de acceso de abajo.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'casos');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, String(req.params.casoId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const nombreUnico = `${Date.now()}-${file.originalname}`;
    cb(null, nombreUnico);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se permiten archivos PDF'));
    }
    cb(null, true);
  },
});

// POST /api/casos/:casoId/documentos -> subir un PDF (solo staff)
router.post(
  '/:casoId/documentos',
  requireTipoCuenta('staff'),
  upload.single('archivo'),
  async (req, res) => {
    const { casoId } = req.params;
    const { tipo_documento, visible_en_portal } = req.body;

    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    try {
      const rutaRelativa = path.join(String(casoId), req.file.filename);
      const { rows } = await pool.query(
        `INSERT INTO documento
          (caso_id, nombre_archivo, tipo_documento, peso_kb, visible_en_portal, ruta_archivo, subido_por_usuario_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, nombre_archivo, tipo_documento, peso_kb, visible_en_portal, fecha_subida`,
        [
          casoId,
          req.file.originalname,
          tipo_documento || 'otro',
          Math.round(req.file.size / 1024),
          visible_en_portal === 'true' || visible_en_portal === true,
          rutaRelativa,
          req.session.user.id,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al guardar el documento' });
    }
  }
);

// GET /api/documentos/:id/descargar -> descarga controlada
router.get('/:id/descargar', async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  try {
    const doc = await pool.query('SELECT * FROM documento WHERE id = $1', [req.params.id]);
    if (doc.rowCount === 0) return res.status(404).json({ error: 'Documento no encontrado' });
    const documento = doc.rows[0];

    if (user.tipoCuenta === 'cliente') {
      if (!documento.visible_en_portal) {
        return res.status(403).json({ error: 'Este documento no está disponible para vos' });
      }
      const vinculo = await pool.query(
        'SELECT 1 FROM caso_cliente WHERE caso_id = $1 AND cliente_id = $2',
        [documento.caso_id, user.id]
      );
      if (vinculo.rowCount === 0) {
        return res.status(403).json({ error: 'No tenés acceso a este documento' });
      }
    }

    const rutaCompleta = path.join(UPLOAD_DIR, documento.ruta_archivo);
    res.download(rutaCompleta, documento.nombre_archivo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al descargar el documento' });
  }
});

module.exports = router;
