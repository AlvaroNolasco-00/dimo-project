export interface ToolHelpStep {
  instruction: string;
}

export interface ToolHelp {
  title: string;
  description: string;
  steps: ToolHelpStep[];
}

export const TOOL_HELP_CONTENT: Record<string, ToolHelp> = {
  'enhance': {
    title: 'Mejorar Imagen',
    description: 'Ajusta contraste, brillo y nitidez de la imagen.',
    steps: [
      { instruction: 'Sube o selecciona una imagen.' },
      { instruction: 'Mueve el deslizador de <b>Contraste</b> para intensificar o suavizar las diferencias de tono (0.5 = suave, 2.0 = intenso).' },
      { instruction: 'Ajusta el <b>Brillo</b> para aclarar u oscurecer la imagen (0.5 = oscuro, 2.0 = muy claro).' },
      { instruction: 'Aumenta la <b>Nitidez</b> para definir bordes y detalles (0 = sin efecto, 3.0 = máximo).' },
      { instruction: 'Pulsa <b>Procesar Imagen</b> para aplicar los cambios.' },
    ]
  },

  'upscale': {
    title: 'Upscaling — Ampliar Resolución',
    description: 'Aumenta la resolución de la imagen usando IA.',
    steps: [
      { instruction: 'Sube la imagen que quieres ampliar.' },
      { instruction: 'Elige el <b>Factor de Escala</b>: 2x duplica el tamaño, 4x lo cuadriplica, etc. Mayor factor = más tiempo de procesado.' },
      { instruction: 'Ajusta la <b>Mejora de Detalles</b>: valores bajos (0–1) son más naturales; valores altos (2–3) añaden más definición artificial.' },
      { instruction: 'Pulsa <b>Procesar Imagen</b>. El procesado puede tardar varios minutos según el factor elegido.' },
      { instruction: 'Cuando el resultado aparezca, usa la vista <b>Comparación</b> para ver original vs. resultado.' },
    ]
  },

  'remove-bg': {
    title: 'Eliminar Fondo',
    description: 'Elimina el fondo con IA o seleccionando colores/pincel.',
    steps: [
      { instruction: 'Elige un modo: <b>Automático (IA)</b>, <b>Manual (Colores)</b> o <b>Manual (Dibujo)</b>.' },
      { instruction: '<b>Automático:</b> Haz clic sobre los colores del fondo directamente en la imagen. Ajusta la <b>Tolerancia</b> para incluir tonos similares. Pulsa <b>Procesar</b>.' },
      { instruction: '<b>Manual (Colores):</b> Usa el botón <b>Agregar Color</b> para seleccionar colores del fondo desde el selector. Repite para añadir varios colores. Ajusta la <b>Tolerancia</b> y pulsa <b>Procesar</b>.' },
      { instruction: '<b>Manual (Dibujo):</b> Pinta con el pincel sobre el área que quieres eliminar. Ajusta el <b>Tamaño del Pincel</b> según necesites.' },
      { instruction: 'Activa <b>Asistente Inteligente</b> (en modo Dibujo) para que el sistema ajuste automáticamente los bordes.' },
      { instruction: 'Usa los botones <b>Deshacer</b> y <b>Limpiar</b> para corregir errores en el lienzo.' },
      { instruction: 'Pulsa <b>Procesar Imagen</b> para aplicar.' },
    ]
  },

  'remove-objects': {
    title: 'Borrar Objetos',
    description: 'Elimina objetos indeseados marcándolos con pincel o varita mágica.',
    steps: [
      { instruction: 'Elige el método: <b>Pincel</b> para pintar la zona manualmente, o <b>Varita Mágica</b> para seleccionar por color.' },
      { instruction: '<b>Pincel:</b> Ajusta el <b>Tamaño del Pincel</b> y pinta sobre el objeto que quieres eliminar. Cubre toda su área.' },
      { instruction: '<b>Varita Mágica:</b> Ajusta la <b>Tolerancia</b> (valores altos seleccionan más rango de color). Haz clic sobre el objeto en la imagen para seleccionarlo.' },
      { instruction: 'Usa <b>Deshacer</b> para quitar el último trazo, o <b>Limpiar</b> para borrar toda la selección.' },
      { instruction: 'Pulsa <b>Procesar Imagen</b> para eliminar el objeto seleccionado.' },
    ]
  },

  'halftone': {
    title: 'Semitonos (Halftone)',
    description: 'Convierte la imagen en arte de semitonos estilo serigrafía.',
    steps: [
      { instruction: 'Ajusta el <b>Tamaño de Punto</b>: puntos pequeños (2px) dan más detalle; puntos grandes (10px) dan efecto más gráfico.' },
      { instruction: 'Modifica la <b>Escala de Intensidad</b> para controlar el contraste del efecto (0.5 = suave, 2.0 = fuerte).' },
      { instruction: 'Ajusta la <b>Separación</b> entre puntos: 0 = puntos pegados, 10 = mucho espacio entre puntos.' },
      { instruction: 'Haz clic en <b>Seleccionar Base</b> para elegir el color de fondo (color de la camisa o superficie). Este color se usa para el efecto <i>knockout</i>.' },
      { instruction: 'Los colores seleccionados aparecen como chips debajo. Haz clic en <b>×</b> en un chip para eliminarlo.' },
      { instruction: 'Pulsa <b>Procesar Imagen</b> para generar el arte de semitonos.' },
    ]
  },

  'contour-clip': {
    title: 'Recorte de Contorno',
    description: 'Recorta el contorno de un objeto con IA o marcándolo manualmente.',
    steps: [
      { instruction: 'Elige el modo: <b>Automático (IA)</b> detecta el contorno solo; <b>Marcado Manual</b> lo defines tú.' },
      { instruction: '<b>Automático:</b> La IA detecta el sujeto principal. Pulsa <b>Procesar Imagen</b> directamente.' },
      { instruction: '<b>Manual:</b> Pinta sobre el objeto que quieres <b>CONSERVAR</b> (no sobre el fondo). Ajusta el <b>Tamaño del Pincel</b> según el detalle.' },
      { instruction: 'Activa <b>Asistente Inteligente</b> para que el sistema ajuste automáticamente los bordes al contorno real del objeto.' },
      { instruction: 'Usa <b>Deshacer</b> y <b>Limpiar</b> para corregir el marcado.' },
      { instruction: 'Pulsa <b>Procesar Imagen</b> para recortar el contorno.' },
    ]
  },

  'crop': {
    title: 'Recortar Foto',
    description: 'Recorta la imagen con proporciones libres o predefinidas.',
    steps: [
      { instruction: 'Selecciona una proporción: <b>Libre</b> para recorte personalizado, o uno de los formatos fijos (1:1, 3:4, 4:3, 9:16, 16:9).' },
      { instruction: 'Ajusta el recuadro de recorte arrastrando sus bordes o esquinas sobre la imagen.' },
      { instruction: 'Mueve el recuadro completo arrastrando desde su centro para reposicionarlo.' },
      { instruction: 'Pulsa <b>Procesar Imagen</b> para aplicar el recorte.' },
    ]
  }
};
