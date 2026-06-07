# Fire Cheat Web

Página conectada a MySQL con productos editables, panel administrativo, reportes y actualización automática.

## Abrir la página

Haz doble clic en `INICIAR-SERVIDOR.cmd` y abre:

- Página principal: `http://localhost:3001`
- Panel administrativo: `http://localhost:3001/admin.html`

Las funciones de MySQL y el panel no funcionan con Go Live porque necesitan el servidor Node.

## Acceso inicial

- Usuario: `Firechets`
- Contraseña: configurada de forma privada en `.env`.

Puedes cambiar estas credenciales en `.env` antes de crear el usuario por primera vez.

## Base de datos

La base se llama `fire_cheat_web`. Puedes verla desde MySQL-Front actualizando la lista de bases de datos.

Tablas principales:

- `products`: productos de la página.
- `users`: acceso del administrador.
- `sales`: solicitudes y estados de ventas.
- `analytics_events`: visitas, compras y clics hacia Discord.
- `settings`: enlace de Discord y datos generales.
