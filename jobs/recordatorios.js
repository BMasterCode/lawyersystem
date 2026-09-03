// jobs/recordatorios.js
const cron = require('node-cron');
const pool = require('../db/pool');
const { enviarWhatsApp } = require('../utils/whatsapp');

// Arma y envía los recordatorios de audiencias/plazos que vencen HOY,
// agrupados por abogado responsable, a su teléfono.
async function enviarRecordatoriosDelDia() {
  try {
    const audiencias = await pool.query(`
      SELECT u.id AS usuario_id, u.telefono, u.nombre,
             a.fecha_hora, a.tipo_audiencia, c.numero_expediente
      FROM audiencia a
      JOIN caso c ON c.id = a.caso_id
      JOIN usuario u ON u.id = c.abogado_responsable_id
      WHERE a.fecha_hora::date = CURRENT_DATE AND a.estado = 'programada'
    `);

    const plazos = await pool.query(`
      SELECT u.id AS usuario_id, u.telefono, u.nombre,
             p.tipo_plazo, c.numero_expediente
      FROM plazo p
      JOIN caso c ON c.id = p.caso_id
      JOIN usuario u ON u.id = c.abogado_responsable_id
      WHERE p.fecha_vencimiento_calculada = CURRENT_DATE AND p.estado != 'cumplido'
    `);

    const porAbogado = {};
    for (const a of audiencias.rows) {
      porAbogado[a.usuario_id] = porAbogado[a.usuario_id] || { telefono: a.telefono, nombre: a.nombre, lineas: [] };
      const hora = new Date(a.fecha_hora).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
      porAbogado[a.usuario_id].lineas.push(`- ${hora} audiencia (${a.tipo_audiencia}) del caso ${a.numero_expediente}`);
    }
    for (const p of plazos.rows) {
      porAbogado[p.usuario_id] = porAbogado[p.usuario_id] || { telefono: p.telefono, nombre: p.nombre, lineas: [] };
      porAbogado[p.usuario_id].lineas.push(`- Vence hoy el plazo "${p.tipo_plazo}" del caso ${p.numero_expediente}`);
    }

    for (const usuarioId in porAbogado) {
      const { telefono, nombre, lineas } = porAbogado[usuarioId];
      const mensaje = `Hola ${nombre}, tu agenda de hoy en LexSystem:\n${lineas.join('\n')}`;
      await enviarWhatsApp(telefono, mensaje);
    }
  } catch (err) {
    console.error('Error al armar los recordatorios del día:', err);
  }
}

// Corre todos los días a las 7:00 am (hora del servidor)
function iniciarRecordatoriosDiarios() {
  cron.schedule('0 7 * * *', enviarRecordatoriosDelDia);
  console.log('Recordatorios diarios programados para las 7:00 am.');
}

module.exports = { iniciarRecordatoriosDiarios, enviarRecordatoriosDelDia };
