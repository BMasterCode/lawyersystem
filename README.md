# LawyerSystem

Sistema de gestión de casos para estudios jurídicos, con:
- Login separado para **staff** (socio/abogado/asistente) y **cliente**.
- Sidebar que aparece solo al presionar el botón de 3 líneas (☰), con
  ítems distintos según el rol logueado.
- Backend en **Node.js + Express**, con la vista (HTML), el estilo
  (CSS) y la lógica (JS) en archivos separados.
- Base de datos en **PostgreSQL**, generada 1:1 desde tu diagrama ER
  (`db/schema.sql`).

## Estructura

```
lawyersystem/
  server.js              punto de entrada
  db/
    schema.sql            todas las tablas del diagrama ER
    pool.js                conexión a PostgreSQL
    init.js                 corre schema.sql (npm run db:init)
  middleware/auth.js       protege rutas según sesión y rol
  routes/
    auth.js                login / logout / "quién soy"
    casos.js                listar / crear / ver un caso
    dashboard.js            KPIs del panel general
    portal.js                casos del cliente logueado
  public/
    css/style.css           TODO el estilo vive acá, separado del HTML
    js/sidebar.js            arma el menú lateral y el botón ☰
    login.html, dashboard.html, casos.html, portal.html
```

## Cómo correrlo localmente

```bash
cd lawyersystem
npm install
cp .env.example .env       # y completá DATABASE_URL con tus datos
npm run db:init            # crea todas las tablas
npm start                  # http://localhost:3000
```

## Crear tu primer usuario (abogado)

Como no hay pantalla de registro todavía (el estudio suele crear las
cuentas, no el público), generá el hash de la contraseña y insertalo
a mano la primera vez:

```bash
node -e "console.log(require('bcrypt').hashSync('tu-clave', 10))"
```

```sql
INSERT INTO usuario (nombre, email, password_hash, rol)
VALUES ('Maribel Guzmán', 'maribel@estudio.com', '<hash-generado>', 'abogado');
```

Para un cliente es igual pero en la tabla `cliente` (con `tipo`, `ci_nit`, etc).

## ¿PostgreSQL propio o Supabase?

Ambos funcionan perfecto para este proyecto — es el mismo motor
(PostgreSQL) por debajo, y `db/schema.sql` sirve sin cambios en
cualquiera de los dos. La diferencia es de **infraestructura**, no de
lo que podés construir:

- **PostgreSQL propio** (en tu compu, un servidor, o un contenedor
  Docker): vos administrás todo — backups, usuarios, actualizaciones.
  Total control, pero más trabajo de mantenimiento. Bien para
  aprender cómo funciona una base de datos de verdad.
- **Supabase**: es PostgreSQL alojado, con backups automáticos,
  panel visual para ver/editar tablas, autenticación lista para usar
  si más adelante querés reemplazar tu propio login, y almacenamiento
  de archivos (útil para los documentos del caso). Te ahorra
  configuración de servidor. El plan gratuito alcanza sin problema
  para un proyecto de estudio o de práctica.

Para este proyecto, con el volumen de datos de un estudio jurídico
chico o mediano, cualquiera de los dos te va a andar bien. Si preferís
no preocuparte por levantar un servidor de base de datos, Supabase es
el camino más rápido: solo cambiás `DATABASE_URL` en `.env` por la
cadena de conexión que te da Supabase y todo el resto del código (el
`pool.js`, las rutas, las consultas SQL) funciona sin tocar nada.
