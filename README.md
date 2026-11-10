# Tri Relay

Calendario sencillo para el equipo de triatlón. Sin cuentas para los participantes, sin contraseñas y sin token del bot. Cada persona escribe su nombre. La misma web funciona en un navegador o como Mini App de Telegram.

## Qué hace

- Calendario mensual de lunes a domingo con bolitas en las fechas con eventos.
- En móvil, tocar un día abre directamente una ventana con sus eventos y un botón para volver al calendario; no hay que buscar los planes debajo de la página.
- Para crear un evento hay que seleccionar antes su día. No hay un formulario con otra fecha.
- Al seleccionar un día aparecen sus eventos. Se puede abrir uno para ver la lista y apuntarse, o crear otro en esa fecha.
- Nombre del evento, día, distancia/modalidad opcional y nombres de personas.
- Cada modalidad tiene su propia lista: por ejemplo, Challenge Barcelona · Olímpica y Challenge Barcelona · Half. Repetir el mismo evento, día y modalidad abre el existente. Repetir una inscripción no duplica el nombre; dos personas con el mismo nombre deben añadir su apellido.
- Los datos reales se guardan en una hoja privada de Google, compartidos entre todos los dispositivos. No se guardan en el repositorio público.

## Probar aquí

Necesitas Python y un navegador. No hay dependencias que instalar.

```powershell
npm start
```

Abre http://localhost:8080/?demo=1. La demo tiene datos de ejemplo y guarda los cambios **solo en ese navegador**. La página muestra claramente que es una demo. No sirve como calendario compartido. Los datos de ejemplo no se copian al calendario real.

Pruebas automáticas: `npm test` (Node 18 o posterior).

## Publicación gratuita con las cuentas que ya tienes

GitHub Pages aloja la pantalla con HTTPS; Google Sheets y Apps Script guardan y sirven los datos. No se necesita un dominio propio, tarjeta, servidor encendido ni una nueva cuenta. Los servicios tienen cuotas gratuitas y pueden cambiar sus condiciones; no se activa ningún servicio de pago. Para GitHub Free, el repositorio de Pages debe ser público. Google debe permitir publicar Apps Script para «Cualquier persona»; algunas cuentas de empresa bloquean esta opción. Los participantes solo necesitan Telegram.

### 1. Preparar Google (una vez)

1. Crea una hoja de cálculo en tu cuenta de Google, llamada **Tri Relay**. Consérvala privada: no es necesario compartirla ni publicarla.
2. En la hoja, abre **Extensiones → Apps Script**. Sustituye el contenido de `Código.gs` por el archivo `google-apps-script/Code.gs` de este proyecto y guarda.
3. En Configuración del proyecto, activa «Mostrar el archivo de manifiesto appsscript.json en el editor». En el editor, reemplaza ese archivo por `google-apps-script/appsscript.json`. Así el script solicita únicamente acceso a hojas de cálculo.
4. Selecciona la función **setup** en el editor y pulsa **Ejecutar**. Autoriza tu script para acceder a tus hojas. Si Google indica que esta aplicación propia no está verificada, revisa que se trata del código que acabas de copiar. No hace falta tramitar una verificación ni publicarla en una tienda. La conexión con la hoja se configura automáticamente.
5. Se crearán las pestañas **Eventos** y **Personas**. No cambies sus cabeceras; los nombres se guardan como cadenas JSON para que nunca se interpreten como fórmulas. `setup` se puede volver a ejecutar sin borrar los datos.
6. Pulsa **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier persona** (no «cualquier persona con una cuenta de Google»). Implementa y copia la URL que termina en `/exec`.
7. En `docs/config.js`, pega esa URL:

```js
window.TRI_CONFIG = { apiUrl: "https://script.google.com/macros/s/TU_IMPLEMENTACION/exec" };
```

Esta URL es pública y no es una contraseña. No pegues tokens, claves de Google ni credenciales en el repositorio.

### 2. Publicar en GitHub Pages

1. Crea un repositorio público en tu GitHub (por ejemplo, `tri-relay`) y sube los archivos de este proyecto, conservando las carpetas.
2. En el repositorio, abre **Settings → Pages → Build and deployment**.
3. Source: **Deploy from a branch**. Branch: la rama en la que has subido los archivos (normalmente `main`). Carpeta: **/docs**. Pulsa **Save**.
4. Cuando GitHub termine de publicar, la dirección será `https://TU_USUARIO.github.io/tri-relay/`. Comprueba que esté activado **Enforce HTTPS**.
5. Abre la dirección sin `?demo=1`: crea un evento y apúntate. Abre la misma dirección en otro dispositivo o navegador y comprueba que se ve la inscripción. Esto verifica también la conexión real entre GitHub y Google, que no puede probarse solo con los archivos locales.

### 3. Abrirla como Mini App de Telegram

1. En Telegram, abre el bot oficial **@BotFather**: https://t.me/BotFather.
2. Envía `/newbot` y elige nombre y usuario del bot (el usuario debe terminar en `bot`). Conserva su token privado: **esta aplicación no lo necesita**.
3. Abre `/mybots`, selecciona tu bot y busca **Bot Settings → Configure Mini App → Enable Mini App**. Configura como URL principal la dirección HTTPS de GitHub Pages, sin `?demo=1`.
4. Abre la Mini App desde el perfil del bot. El enlace de su Mini App principal es `https://t.me/TU_BOT?startapp`.
5. Pega ese enlace en el grupo del equipo y **fija el mensaje**. Cualquiera podrá abrir el calendario en Telegram y escribir su nombre. No necesitas añadir el bot como administrador del grupo.

Mensaje sugerido:

> 🏊 🚴 🏃 Calendario del equipo
>
> Abre el calendario, toca un día y apúntate al plan. Si no existe tu evento, créalo desde esa misma fecha.
>
> https://t.me/TU_BOT?startapp

## Acceso y límites de esta versión

Por petición del equipo no hay autenticación: cualquier persona que tenga el enlace puede leer los eventos, ver nombres y añadir eventos o inscripciones. La hoja sigue siendo privada, pero la aplicación sirve esos datos públicamente. No se comprueba que un nombre pertenezca a quien lo escribe. No hay borrado desde la web; si hay que corregir una inscripción o un evento, la persona propietaria puede eliminar su fila en la hoja (al eliminar un evento, elimina también las filas de Personas con el mismo eventId). Se recomienda una copia periódica de la hoja.

El nombre del último participante se recuerda opcionalmente en el navegador para no escribirlo de nuevo. No se usan analíticas. La lista se actualiza al cambiar de mes, volver a hoy o regresar a la aplicación; no hay actualización en tiempo real ni mensajes automáticos al chat.

Si la conexión se interrumpe durante un guardado, comprueba el evento antes de repetir. Las operaciones son idempotentes por fecha/nombre de evento y nombre de participante, y Apps Script usa un bloqueo para evitar duplicados en peticiones simultáneas.

Al cambiar `Code.gs`, guarda y usa **Implementar → Gestionar implementaciones → Editar → Nueva versión** para conservar la misma URL. Publicar solo el código sin actualizar la implementación no actualiza el servicio. Para actualizar desde la versión sin distancia, ejecuta también **setup** una vez: añade la columna `distanceJson` y conserva los eventos e inscripciones anteriores.

## Comprobación antes de compartir

- En el móvil se puede seleccionar un día, abrir su evento, ver nombres y apuntarse.
- Un segundo navegador ve el mismo evento y los mismos participantes.
- Se pueden crear dos eventos distintos el mismo día y cambiar de mes.
- La página real no muestra el aviso de demo y no requiere iniciar sesión en Google.
- El enlace `t.me/...?...` abre la Mini App y funciona desde el mensaje fijado.

## Documentación oficial

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- HTTPS: https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
- Aplicaciones web de Apps Script: https://developers.google.com/apps-script/guides/web
- Content Service (redirección de respuestas): https://developers.google.com/apps-script/guides/content
- Cuotas de Google: https://developers.google.com/apps-script/guides/services/quotas
- Mini Apps y enlaces de Telegram: https://core.telegram.org/bots/webapps
