// public/js/sidebar.js
// Construye el sidebar según si el usuario logueado es 'staff' o 'cliente',
// y maneja el botón de 3 líneas horizontales (hamburguesa) que lo abre/cierra.

const MENU_STAFF = [
  { href: '/dashboard.html', icon: '▣', label: 'Dashboard' },
  { href: '/casos.html', icon: '📁', label: 'Casos' },
  { href: '/agenda.html', icon: '▦', label: 'Agenda y plazos' },
  { href: '/clientes.html', icon: '☺', label: 'Clientes' },
  { href: '/facturacion.html', icon: 'Bs', label: 'Facturación' },
];

const MENU_CLIENTE = [
  { href: '/portal.html', icon: '📄', label: 'Mis casos' },
];

async function initSidebar() {
  const res = await fetch('/auth/me');
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const { user } = await res.json();

  const menu = user.tipoCuenta === 'staff' ? MENU_STAFF : MENU_CLIENTE;
  const sidebar = document.getElementById('sidebar');
  const currentPath = window.location.pathname;

  const items = menu
    .map(
      (item) => `
      <a class="nav-item ${item.href === currentPath ? 'active' : ''}" href="${item.href}">
        <span class="nav-icon">${item.icon}</span> ${item.label}
      </a>`
    )
    .join('');

  sidebar.innerHTML = `
    <div class="brand">Lex<span>System</span></div>
    ${items}
    <div class="sidebar-foot">
      ${user.nombre}<br>
      <a href="#" id="logout-link" style="color:#cdd3dc;">Cerrar sesión</a>
    </div>
  `;

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  const avatar = document.getElementById('avatar');
  if (avatar) avatar.textContent = user.nombre.slice(0, 2).toUpperCase();
}

function initHamburger() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  function toggle() {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  }
  function close() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  }

  hamburger.addEventListener('click', toggle);
  overlay.addEventListener('click', close);
}

document.addEventListener('DOMContentLoaded', () => {
  initHamburger();
  initSidebar();
});
