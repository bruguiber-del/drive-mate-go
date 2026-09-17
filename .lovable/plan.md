# Corregir superposiciones de navegación

## Cambios
- Permitir que la barra de destino se encoja con `min-w-0` y mantener siempre visibles los botones de voz y detener con `shrink-0`.
- Sustituir las dos tarjetas del conductor en navegación por un único aviso compacto: maniobra principal y, debajo, fase actual con ETA.
- Detectar colisiones entre etiquetas de marcadores usando sus posiciones proyectadas en pantalla; ocultar únicamente las etiquetas cercanas y conservar todos los iconos.

## Validación
- Comprobar navegación activa con pasajero en móvil y escritorio.
- Confirmar que los controles superiores permanecen visibles con destinos largos.
- Confirmar que etiquetas próximas se ocultan y reaparecen al separar los marcadores o cambiar el zoom.

## Detalles técnicos
- La detección de etiquetas se actualizará al terminar movimientos y cambios de zoom del mapa, sin alterar rutas, marcadores ni lógica de negocio.
