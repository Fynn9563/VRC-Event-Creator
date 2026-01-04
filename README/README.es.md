<h1 align="center">
  <img src="../electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://img.shields.io/github/downloads/Cynacedia/VRC-Event-Creator/total?style=plastic&labelColor=555&color=blue" alt="Downloads" />
  </a>
</p>
<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.zh.md">中文（简体）</a> |
  <a href="README.pt.md">Português</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.ru.md">Русский</a>
</p>
Una herramienta todo en uno de creación de eventos para VRChat que elimina la configuración repetitiva.
Crea y guarda plantillas de eventos por grupo, genera fechas próximas a partir de patrones recurrentes simples y completa los detalles al instante - perfecta para programar rápidamente reuniones semanales, noches de visualización y eventos comunitarios.

## Capturas de pantalla
<table>
  <tr>
    <td align="center">
      <img src=".imgs/1MP-Basics-Screenshot%202026-01-02%20230956.png" width="300" alt="Perfiles: plantillas" />
      <br />
      Perfiles: plantillas
    </td>
    <td align="center">
      <img src=".imgs/2MP-Schedule-Screenshot%202026-01-02%20231523.png" width="300" alt="Perfiles: reglas de programación" />
      <br />
      Perfiles: reglas de programación
    </td>
    <td align="center">
      <img src=".imgs/3CE-ProfileSelect-Screenshot%202026-01-02%20231634.png" width="300" alt="Crear: seleccionar perfil" />
      <br />
      Crear: seleccionar perfil
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src=".imgs/4CE-DateSelect-Screenshot%202026-01-02%20231805.png" width="300" alt="Crear: elegir una fecha" />
      <br />
      Crear: elegir una fecha
    </td>
    <td align="center">
      <img src=".imgs/5CE-Review-Screenshot%202026-01-02%20231907.png" width="300" alt="Crear: revisar y enviar" />
      <br />
      Crear: revisar y enviar
    </td>
    <td align="center">
      <img src=".imgs/6S-ThemeStudio-Screenshot%202026-01-02%20232221.png" width="300" alt="Estudio de temas: interfaz personalizada" />
      <br />
      Estudio de temas: interfaz personalizada
    </td>
  </tr>
</table>

## Descarga
- GitHub Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases
- El `.exe` portátil de Windows funciona de forma independiente (no se requiere Node.js para ejecutarlo).
- Los datos de la aplicación se almacenan en el directorio de datos de usuario estándar de Electron (mostrado en Configuración > Información de la aplicación), salvo que lo sobrescribas con `VRC_EVENT_DATA_DIR`.

## Funcionalidades
- Perfiles/plantillas que rellenan automáticamente los detalles del evento por grupo.
- Generador de patrones recurrentes con lista de próximas fechas y opción manual de fecha/hora.
- Asistente de creación de eventos para calendarios de grupo.
- Vista de modificar eventos para próximos eventos (rejilla + modal de edición).
- Estudio de temas con presets y control total de colores de la UI (compatible con #RRGGBBAA).
- Selector y subida de imágenes de galería para IDs de imagen.
- Localización con selección de idioma en el primer inicio (en, fr, es, de, ja, zh, pt, ko, ru).

## Almacenamiento de datos
La aplicación almacena sus archivos en el directorio de datos de usuario de Electron (mostrado en Configuración > Información de la aplicación):

- `profiles.json` (plantillas de perfiles)
- `cache.json` (tokens de sesión)
- `settings.json` (correo de contacto)
- `themes.json` (presets de temas y colores personalizados)

Puedes sobrescribir el directorio de datos con la variable de entorno `VRC_EVENT_DATA_DIR`.
En el primer inicio, la aplicación intentará importar un `profiles.json` existente desde la carpeta del proyecto.

No compartas archivos de caché; contienen tokens de sesión.

## Notas de uso
- Los perfiles requieren Nombre de perfil, Nombre del evento y Descripción antes de continuar.
- Se requiere un correo de contacto en el primer inicio para el uso de la API de VRChat.
- Los grupos privados solo pueden usar Tipo de acceso = Grupo.
- La duración usa DD:HH:MM y tiene un máximo de 31 días.
- Las etiquetas están limitadas a 5 y los idiomas a 3.
- Las subidas a la galería se limitan a PNG/JPG, 64-2048 px, menos de 10 MB y 64 imágenes por cuenta.
- Actualmente VRChat solo permite hasta 10 eventos próximos a la vez.

## Actualizaciones
- Comprueba al iniciar y una vez por hora mientras se ejecuta.
- UPDATE enlaza al repositorio de GitHub cuando hay una nueva versión.
- La creación y edición de eventos se bloquean cuando se muestra UPDATE.
- Sin actualizador automático; actualizaciones manuales.

## Solución de problemas
- Problemas de inicio de sesión: elimina `cache.json` y vuelve a iniciar sesión (usa la carpeta de datos indicada en Información de la aplicación).
- Grupos faltantes: tu cuenta debe tener acceso al calendario en el grupo objetivo.
- Limitación de velocidad: VRChat puede limitar la creación de eventos. Espera y vuelve a intentar, y detente si varias tentativas fallan. No hagas spam de los botones de refresco o creación de eventos.

## Privacidad y seguridad
- Tu contraseña no se almacena. Solo se guardan en caché los tokens de sesión.
- No compartas `cache.json` ni las carpetas de datos de la aplicación.

## Traducciones
*Las traducciones son automáticas y pueden ser inexactas; por favor aporta correcciones.
- English: ../README.md
- Français: README.fr.md
- Español: README.es.md
- Deutsch: README.de.md
- 日本語: README.ja.md
- 中文（简体）: README.zh.md
- Português: README.pt.md
- 한국어: README.ko.md
- Русский: README.ru.md

## Cómo funciona
- La aplicación usa Electron:
  - `electron/main.js` maneja llamadas a la API de VRChat, persistencia de perfiles y caché de sesión.
  - `electron/preload.js` expone métodos IPC al renderer.
  - `electron/renderer/` renderiza la interfaz y administra el flujo del asistente.
  - `electron/core/date-utils.js` genera fechas próximas a partir de patrones.

## Descargo de responsabilidad
Este proyecto no está afiliado ni respaldado por VRChat. Utilízalo bajo tu propio riesgo.

## Requisitos (compilación desde el código fuente)
- Node.js 20+ (22.21.1 recomendado)
- npm
- Una cuenta de VRChat con permiso para crear eventos en al menos un grupo

## Configuración (desde el código fuente)
1) Instala las dependencias:

```bash
npm install
```

2) Proporciona un correo de contacto para el uso de la API de VRChat:
- Introdúcelo cuando se solicite en el primer inicio, o actualízalo en Información de la aplicación.

## Ejecutar (desde el código fuente)
```bash
npm run start:gui
```

## Compilación
- Build portable de Windows:

```bash
npm run dist:gui
```

- Builds multiplataforma (requiere herramientas macOS/Linux para DMG/AppImage):

```bash
npm run dist:gui:all
```
