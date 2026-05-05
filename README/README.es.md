<h1 align="center">
  <img src="../electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://gist.githubusercontent.com/Cynacedia/30c5da7160619ca08933e7e3e92afcc3/raw/downloads-badge.svg" alt="Downloads" />
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
  <a href="README.ru.md">Русский</a> |
  <a href="README.nl.md">Nederlands</a>
</p>

Una herramienta todo en uno de creación de eventos para VRChat que elimina la configuración repetitiva.
Crea y guarda plantillas de eventos por grupo, genera fechas próximas a partir de patrones recurrentes simples y completa los detalles al instante. Perfecta para programar rápidamente reuniones semanales, noches de visualización y eventos comunitarios.

<p align="center">
  <img src=".imgs/1MP-CE_CreationFlow-01-05-26.gif" width="900" alt="Flujo de creación de eventos (plantilla a publicación)" />
</p>

## Plantillas y series nativas, una al lado de la otra

VRChat ahora ofrece su propia función de eventos recurrentes. Es ideal para eventos estables que se repiten: una vez creada la serie, VRChat la mantiene por su cuenta sin necesidad de tener la aplicación abierta, y todo el ciclo se anuncia una sola vez en el momento de la creación. Editar una serie en curso desde VRChat normalmente implica eliminarla y volver a crearla; esta aplicación se encarga de ese paso por ti cuando cambias el calendario, así que la operación se siente como una edición normal. La contrapartida es que no hay anuncios por ocurrencia, así que los ajustes que hagas más tarde sobre eventos individuales pueden pasar desapercibidos para tu comunidad.

Las plantillas funcionan de otra manera. El flujo principal es manual: tú creas un evento a la vez, y la plantilla rellena el formulario para que no tengas que volver a escribir los detalles. A partir de ahí, una automatización opcional puede seguir publicando los próximos eventos según un calendario, cada uno con su propio anuncio para que tu comunidad sepa cuándo viene algo nuevo. Los cambios hechos sobre un evento pendiente se anunciarán cuando esa publicación salga, así que las modificaciones de última hora no pasan desapercibidas. La pega: la publicación automática requiere que la aplicación esté en ejecución.

Ambas conviven en la misma pestaña **Gestionar planificaciones**. Puedes usar una, otra o las dos en el mismo grupo, lo que mejor encaje con el evento.

## Funcionalidades
- Plantillas que rellenan automáticamente los detalles del evento por grupo (con automatización opcional para publicar según un calendario).
- Generador de patrones recurrentes con lista de próximas fechas y opción manual de fecha/hora.
- Compatibilidad con series nativas de VRChat, junto con las plantillas.
- Automatización de eventos: publica eventos a partir de los patrones de las plantillas mientras la aplicación esté abierta.
- Vista de Modificar eventos para próximos eventos (rejilla + modal de edición, con filtros y rango de tiempo ajustable).
- Asistente de creación de eventos para calendarios de grupo.
- Estudio de temas con preajustes y control completo de los colores de la interfaz (compatible con #RRGGBBAA).
- Localización con selección de idioma en el primer inicio (en, fr, es, de, ja, zh, pt, ko, ru, nl).
- Selector y subida de imágenes desde la galería para los IDs de imagen.
- Inicio con el sistema + minimizar a la bandeja del sistema.
- Protección de instancia única para evitar inicios duplicados.

### Integraciones opcionales (Opciones avanzadas)

Están desactivadas por defecto y cada una requiere su propia configuración. Una vez configurada, cada una se controla de forma independiente por plantilla y por evento:

- **Discord:** crea automáticamente eventos programados de Discord junto con los eventos de VRChat. Requiere crear un bot de Discord e invitarlo a tu servidor. ([Guía de configuración](Discord%20Setup/DISCORD_SETUP.es.md))
- **Calendario:** genera archivos `.ics` con recordatorios, entregados por webhook de Discord o guardados localmente. ([Guía de configuración](Calendar%20Setup/CALENDAR_SETUP.es.md))
- **EC Kit** (licencia de pago): personalización de la identidad del webhook por grupo (nombre mostrado, avatar, color del embed) y mensajes personalizados con imágenes adjuntas por evento. ([Ko-fi](https://ko-fi.com/s/0735ce5375) · [Licencia](https://eckit-worker.cynacedia.workers.dev/license/v1.0))

## Descarga
- Versiones: https://github.com/Cynacedia/VRC-Event-Creator/releases

## Privacidad y almacenamiento de datos
Tu contraseña no se guarda. Solo los tokens de sesión se almacenan en caché.
La aplicación guarda sus archivos en el directorio de datos de usuario de Electron (que aparece en Configuración > Información de la aplicación):

- `profiles.json` (plantillas de eventos y configuración de integraciones por grupo)
- `series.json` (series nativas de VRChat seguidas localmente)
- `cache.json` (tokens de sesión)
- `settings.json` (configuración de la aplicación)
- `themes.json` (preajustes de temas y colores personalizados)
- `pending-events.json` (cola de automatización)
- `automation-state.json` (seguimiento de la automatización)
- `pending-rasterize.json` (creaciones de series en cola tras un límite de velocidad)

Puedes anular el directorio de datos con la variable de entorno `VRC_EVENT_DATA_DIR`.
En el primer inicio, la aplicación intentará importar un `profiles.json` existente desde la carpeta del proyecto.

Los tokens de bot (para la integración de Discord) y las URL de webhook se cifran en reposo usando el almacenamiento seguro del sistema operativo. Solo se envían directamente a la API de Discord o a tu URL de webhook.

__**No compartas los archivos de caché ni las carpetas de datos de la aplicación.**__

## Notas de uso
- Las plantillas requieren un nombre de planificación, un nombre de evento y una descripción antes de continuar.
- Los grupos privados solo pueden usar el tipo de acceso = Grupo.
- La duración utiliza DD:HH:MM y está limitada a 31 días.
- Las etiquetas están limitadas a 5 y los idiomas a 3.
- Las subidas a la galería están limitadas a PNG/JPG, 64-2048 px, menos de 10 MB y 64 imágenes por cuenta.
- VRChat limita la creación de eventos a 10 eventos por hora por persona por grupo.
- Las plantillas necesitan que la aplicación esté abierta para publicar automáticamente. Las series, una vez creadas, funcionan por su cuenta.
- Featured Event y otros interruptores especiales requieren permisos de grupo específicos; solo aparecen cuando están permitidos.

## Solución de problemas
- **Problemas de inicio de sesión:** elimina `cache.json` y vuelve a iniciar sesión (usa la carpeta de datos indicada en Configuración > Información de la aplicación).
- **Faltan grupos en el desplegable:** tu cuenta debe tener acceso al calendario en el grupo objetivo. Si acabas de actualizar los permisos en VRChat, pulsa **Resync** para refrescar la lista.
- **Límite de velocidad:** VRChat puede limitar la creación de eventos. Espera y vuelve a intentar, y para si varios intentos fallan. No abuses del botón de actualizar ni del de crear evento.
- **Creación de serie en pausa:** si VRChat ha bloqueado la creación de una serie por límite de velocidad, se reintentará de forma automática. La pestaña de Planificaciones muestra cuándo será el próximo intento, con un botón "Reintentar ahora" si no quieres esperar.
- **Actualizaciones:** algunas funciones se bloquean cuando hay una actualización pendiente. Descarga y ejecuta la última versión.

## Aviso
- Este proyecto no está afiliado ni respaldado por VRChat. Úsalo bajo tu propio riesgo.
- Los idiomas están traducidos automáticamente y pueden ser inexactos; por favor, contribuye con correcciones.

## Requisitos (compilar desde el código fuente)
- Node.js 20+ (22.21.1 recomendado)
- npm
- Una cuenta de VRChat con permiso para crear eventos en al menos un grupo

---

## Agradecimientos
- [🌸potato🌸](https://x.com/potatovrc), traducciones japonesas
- Garvas, traducciones francesas
- Sometsuki, traducciones portuguesas
- Todos los [colaboradores en GitHub](https://github.com/Cynacedia/VRC-Event-Creator/graphs/contributors)
