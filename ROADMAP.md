# Hoja de ruta de NEXTRI

Estado a v2.66. Lo marcado como hecho está verificado con pruebas
automáticas en CI (motor, estado, guardado, RNG, y una prueba de humo que
carga la app real en un navegador y juega una partida).

## Hecho

- Juego local de 2 a 6 jugadores y modo Solo contra Delta, Circuit o Vector.
- Motor puro: `applyAction(state, action)` sin DOM ni globales, con IDs
  estables de jugador. Es el mismo código que podrá ejecutar un servidor.
- Estado serializable, guardar y reanudar partida.
- Generador aleatorio determinista con semilla y flujos separados.
- Registro de eventos y replay, coherente con deshacer.
- Módulos ES reales, rutas relativas, PWA instalable sin conexión.
- Identidad de marca: nombre, icono, paleta y lenguaje.

## Estadísticas (hecho, v2.76)

Instrumentación local completa, sin backend ni analítica de terceros: todo
queda en el dispositivo, en IndexedDB, y sin guardar nombres de personas.
Cada partida se etiqueta con `aiVersion`, para poder comparar el
comportamiento de los rivales antes y después de cambiarlos.

El repositorio está detrás de una interfaz mínima, de modo que en el futuro
se pueda añadir uno contra Supabase sin tocar el motor ni la interfaz.

## IA 2.0 (pendiente, en espera de datos)

Delta, Circuit y Vector con evaluación por fases de partida y búsqueda con
profundidad, manteniendo un solo algoritmo parametrizado. En espera a
propósito: primero hay que jugar partidas con la IA actual para tener una
línea base con la que comparar.

## Antes del online

- **RNG por partida.** Hoy el generador es un singleton del módulo. En el
  navegador solo hay una partida y no pasa nada, pero un servidor con
  varias salas las haría compartir secuencia. Cada partida debe llevar el
  suyo. Es requisito de entrada a la v3.0, no deuda opcional.
- Extraer la capa de interfaz de `index.html` a `src/ui/`.

## v3.x — Juego online

Por orden, sin adelantar pasos:

1. **Invitados primero.** Se entra escribiendo un nombre, sin cuenta.
2. **Salas** con código corto y enlace compartible (más QR, que para jugar
   en persona con varios móviles es lo más cómodo).
3. **Dos jugadores remotos** de principio a fin: crear, unirse, jugar,
   desconectar, reconectar, terminar, revancha.
4. **Servidor autoritativo.** El cliente manda intenciones, nunca
   resultados; el dado lo tira el servidor.
5. Después: OAuth opcional, perfil e historial, salas de 2 a 6.

Tecnología prevista: Supabase (autenticación anónima, PostgreSQL, tiempo
real, RLS), por no montar infraestructura propia.

## v4 — Aplicaciones para Android e iOS

La app ya es instalable como PWA, lo que cubre buena parte del caso de uso
sin pasar por ninguna tienda. El salto a aplicación nativa aporta:
presencia en las tiendas, notificaciones push fiables en iOS, y
posibilidad de juego por turnos asíncrono con avisos.

**Vía recomendada: Capacitor.** Envuelve esta misma web en un contenedor
nativo, de modo que no hay que reescribir el juego ni mantener dos
versiones. Encaja especialmente bien aquí porque el motor ya está separado
de la interfaz y no depende del navegador.

Lo que haría falta, en orden:

1. Añadir Capacitor y generar los proyectos de Android e iOS.
2. Ajustes propios del móvil: zona segura (muescas), botón atrás de
   Android, orientación bloqueada de verdad, vibración nativa.
3. Iconos y pantallas de arranque en todos los tamaños que piden las
   tiendas, a partir de `icon.svg`.
4. Notificaciones push (útiles sobre todo con el modo asíncrono).
5. Publicación: cuenta de desarrollador de Google Play (pago único) y de
   Apple (cuota anual), fichas de tienda, capturas y política de
   privacidad.

**Requisito previo real:** conviene hacerlo *después* del online. Publicar
en tiendas obliga a mantener versiones y a pasar revisiones por cada
cambio, y hacerlo mientras el juego aún cambia de forma cada semana sería
cargar con ese peso demasiado pronto.

## Ideas sin fecha

Modo asíncrono por turnos, amigos e invitaciones, estadísticas, logros.
Ninguna antes de que crear sala → jugar → reconectar → revancha funcione
de forma sólida.
