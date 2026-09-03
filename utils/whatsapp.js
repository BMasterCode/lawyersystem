// utils/whatsapp.js
//
// Esta función es el único lugar del código que "envía" el mensaje.
// Hoy solo lo imprime en la consola del servidor. Para que mande el
// WhatsApp de verdad, hace falta una cuenta en un proveedor de WhatsApp
// Business API (por ejemplo Twilio: https://www.twilio.com/whatsapp) y
// reemplazar el contenido de esta función por la llamada a su API,
// usando las credenciales que te den (Account SID, Auth Token, número
// de WhatsApp habilitado) guardadas en tu .env.
//
// Ejemplo de cómo quedaría con Twilio (referencia, no está activo):
//
// const twilio = require('twilio');
// const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
// async function enviarWhatsApp(telefono, mensaje) {
//   await client.messages.create({
//     from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
//     to: 'whatsapp:' + telefono,
//     body: mensaje,
//   });
// }

async function enviarWhatsApp(telefono, mensaje) {
  if (!telefono) {
    console.log('[recordatorio] no se pudo enviar: el usuario no tiene teléfono cargado');
    return;
  }
  console.log(`[recordatorio WhatsApp -> ${telefono}] ${mensaje}`);
  // TODO: reemplazar este console.log por la llamada real a la API
  // de WhatsApp Business cuando tengas una cuenta configurada.
}

module.exports = { enviarWhatsApp };
