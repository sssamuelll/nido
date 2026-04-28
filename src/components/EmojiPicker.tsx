import React, { useState, useRef, useEffect, useCallback } from 'react';

// Curated emoji list — only Unicode 12.0 and earlier for max device compatibility.
// Removed: 🫐🫑🫒🫓🫔🫕🫖🫀🫁🪫🪙🪜🪛🪚🪤🪓🪝🛖🛻🛞🛼🪂🪘🪗🪃🪁🪀🤌🥸😮‍💨❤️‍🔥❤️‍🩹🧋
const CATEGORIES: Record<string, string[]> = {
  'Frecuentes': ['🍽️','🛒','🏠','💡','🚗','💊','🎉','📱','💰','✈️','☕','🎬'],
  'Caras': [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇',
    '🥰','😍','🤩','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗',
    '🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','🤥',
    '😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶',
    '🥴','😵','🤯','🤠','🥳','😎','🤓','🧐',
  ],
  'Personas': [
    '👋','🤚','🖐️','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘',
    '🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜',
    '👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂',
    '👃','🧠','🦷','🦴','👀','👁️','👅','👄',
  ],
  'Naturaleza': [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮',
    '🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆',
    '🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞',
    '🌸','🌺','🌻','🌹','🌷','🌱','🌲','🌳','🌴','🌵','🍀','🍁',
  ],
  'Comida': [
    '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒',
    '🍑','🥭','🍍','🥥','🥝','🍅','🥑','🥦','🥬','🥒','🌶️',
    '🌽','🥕','🧄','🧅','🥔','🍠','🥐','🍞','🥖','🥨','🧀',
    '🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟',
    '🍕','🥪','🌮','🌯','🥗','🥘','🍝','🍜','🍲',
    '🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮',
    '🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬',
    '🍫','🍿','🍩','🍪','🌰','🥜','🍯','☕','🍵','🧃','🥤',
    '🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾',
  ],
  'Actividades': [
    '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓',
    '🏸','🏒','🥍','🏏','🥅','⛳','🏹','🎣','🤿','🥊',
    '🥋','🎽','🛹','🛷','⛸️','🥌','🎿','⛷️','🏂','🏋️',
    '🤸','🤼','🤽','🤾','🤺','⛹️','🧘','🏄','🏊','🚣','🧗','🚴',
    '🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺',
    '🎸','🎻','🎲','♟️','🎯','🎳','🎮','🕹️','🧩',
  ],
  'Viajes': [
    '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚',
    '🚛','🚜','🏍️','🛵','🚲','🛴','🛺','🚔','🚍','🚘','🚖',
    '🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆',
    '🛩️','✈️','🛫','🛬','💺','🚀','🛸','🚁','🛶','⛵','🚤',
    '🛥️','🛳️','⛴️','🚢','⚓','⛽','🚧','🚦','🚥','🗺️','🗿',
    '🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️',
    '🌋','⛰️','🏔️','🗻','🏕️','🏠','🏡','🏢','🏣','🏤','🏥',
  ],
  'Objetos': [
    '⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀',
    '📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻',
    '🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','📡','🔋',
    '🔌','💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷',
    '💰','💳','💎','⚖️','🧰','🔧','🔨','⚒️','🛠️','⛏️',
    '🔩','⚙️','🧲','🔫','💣','🧨','🔪','🗡️','⚔️',
    '🔑','🗝️','🔒','🔓','🔏','🔐','📦','📫','📬','📭','📮','🗳️',
    '✏️','✒️','🖋️','🖊️','🖌️','🖍️','📝','💼','📁','📂','🗂️','📅',
    '📆','🗒️','🗓️','📇','📈','📉','📊','📋','📌','📍','📎','🖇️',
  ],
  'Símbolos': [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
    '❣️','💕','💞','💓','💗','💖','💘','💝','🔴','🟠','🟡','🟢',
    '🔵','🟣','⚫','⚪','🟤','✅','❌','⭕','💯','🔥','✨','⭐',
    '🌟','💫','🎵','🎶','💤','💢','💬','🏁','🚩','🎌','🏴',
    '🏳️','🏳️‍🌈','♻️','⚜️','🔱','📛','🔰','☑️','✔️',
    '➕','➖','➗','✖️','♾️','‼️','⁉️','❓','❔','❕','❗',
  ],
};

// Search keywords for emojis (Spanish + English)
const EMOJI_KEYWORDS: Record<string, string> = {
  '🍽️':'comida restaurante plato cena dinner food','🛒':'compra super mercado carrito shop cart','🏠':'casa hogar home house jardin',
  '💡':'luz idea light electricidad bombilla bulb','🚗':'coche auto car vehiculo','💊':'salud medicina health pill farmacia',
  '🎉':'fiesta celebracion party','📱':'telefono movil celular phone','💰':'dinero money plata ahorro',
  '✈️':'avion viaje travel flight','☕':'cafe coffee','🎬':'cine pelicula movie film',
  '😀':'feliz happy sonrisa smile','😂':'risa laugh llorar','😍':'amor love corazon',
  '😎':'cool gafas lentes','🤔':'pensar think','😴':'dormir sleep sueño',
  '👍':'bien ok bueno like','👎':'mal dislike','👋':'hola adios wave hello bye',
  '💪':'fuerza gym musculo strong','👏':'aplauso bravo clap',
  '🐶':'perro dog mascota','🐱':'gato cat','🐦':'pajaro bird','🦋':'mariposa butterfly',
  '🌹':'rosa flor rose flower','🌻':'girasol sunflower','🍀':'trebol suerte luck',
  '🍎':'manzana apple fruta','🍊':'naranja orange','🍋':'limon lemon','🍌':'banana platano',
  '🍉':'sandia watermelon','🍇':'uva grape','🍓':'fresa strawberry','🍒':'cereza cherry',
  '🍑':'melocoton peach durazno','🥑':'aguacate avocado','🥦':'brocoli','🌶️':'picante chile pepper',
  '🍞':'pan bread','🧀':'queso cheese','🥚':'huevo egg','🍳':'desayuno breakfast',
  '🍔':'hamburguesa burger','🍕':'pizza','🍟':'papas fries patatas','🌭':'hot dog perro caliente',
  '🌮':'taco','🌯':'burrito wrap','🍝':'pasta espagueti spaghetti','🍜':'ramen noodle sopa',
  '🍣':'sushi japon','🍰':'pastel cake torta','🍦':'helado ice cream','🍩':'dona donut',
  '🍪':'galleta cookie','🍫':'chocolate','🍿':'palomitas popcorn','🍺':'cerveza beer',
  '🍷':'vino wine','🥂':'brindis champagne celebrar',
  '⚽':'futbol soccer','🏀':'basket baloncesto','🎾':'tenis tennis','🎮':'juego game videojuego',
  '🎨':'arte art pintura','🎤':'microfono karaoke cantar sing','🎧':'auriculares headphones musica',
  '🎸':'guitarra guitar','🎹':'piano musica','🎲':'juego dado game dice',
  '🚕':'taxi cab','🚌':'bus autobus','🚲':'bicicleta bike','🏍️':'moto motorcycle',
  '🚄':'tren train','🛩️':'avion avioneta plane','🚢':'barco ship crucero',
  '🏖️':'playa beach','🏔️':'montaña mountain','🏕️':'camping','🏰':'castillo castle',
  '💻':'computadora laptop computer ordenador','📷':'camara foto camera photo',
  '📺':'television tv tele','🔋':'bateria battery',
  '🔧':'herramienta tool','🔨':'martillo hammer','🔑':'llave key',
  '📦':'paquete caja package box','💼':'maletin trabajo work briefcase','📝':'nota escribir note write',
  '📊':'grafico chart estadistica','📅':'calendario calendar fecha date',
  '❤️':'corazon amor love heart','💔':'corazon roto broken heart','🔥':'fuego fire',
  '✨':'estrella sparkle brillar','⭐':'estrella star','💤':'dormir sleep zzz',
  '✅':'check correcto si','❌':'no error cancelar','💯':'perfecto cien',
  '🎵':'musica nota music note','♻️':'reciclar recycle eco',
  '🧡':'naranja corazon orange heart','💛':'amarillo corazon yellow heart',
  '💚':'verde corazon green heart','💙':'azul corazon blue heart',
  '💜':'morado corazon purple heart','🖤':'negro corazon black heart',
  '🏡':'casa jardin','🏢':'oficina office edificio',
  '🎁':'regalo gift present','🎂':'cumpleaños birthday pastel',
  '💳':'tarjeta card credito','💸':'gasto dinero money spend',
  '🏥':'hospital salud health','🏫':'escuela school colegio universidad',
  '⛽':'gasolina gas fuel combustible','🚧':'obra construccion','🗺️':'mapa map',
};

const CATEGORY_ICONS: Record<string, string> = {
  'Frecuentes': '🕐',
  'Caras': '😀',
  'Personas': '👋',
  'Naturaleza': '🌿',
  'Comida': '🍔',
  'Actividades': '⚽',
  'Viajes': '✈️',
  'Objetos': '💡',
  'Símbolos': '❤️',
};

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Frecuentes');
  const pickerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isMobile = useIsMobile();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open && !isMobile) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, isMobile]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (open && isMobile) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open, isMobile]);

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    setSearch('');
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  const scrollToCategory = (cat: string) => {
    setActiveCategory(cat);
    categoryRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filteredCategories = search.trim()
    ? { 'Resultados': Object.values(CATEGORIES).flat().filter(e => {
        const term = search.toLowerCase();
        const keywords = EMOJI_KEYWORDS[e]?.toLowerCase() ?? '';
        return e.includes(search) || keywords.includes(term);
      })}
    : CATEGORIES;

  const pickerContent = (
    <>
      <div className="ep-header">
        {isMobile && (
          <button type="button" className="ep-back" onClick={handleClose}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M19 12H5m0 0 7 7m-7-7 7-7"/>
            </svg>
          </button>
        )}
        <div className="ep-search">
          <svg width="14" height="14" fill="none" stroke="var(--tm)" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            placeholder="Buscar emoji..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus={!isMobile}
          />
        </div>
      </div>

      <div className="ep-grid" ref={gridRef}>
        {Object.entries(filteredCategories).map(([cat, emojis]) => (
          <div key={cat}>
            <div
              className="ep-cat-label"
              ref={el => { categoryRefs.current[cat] = el; }}
            >
              {cat}
            </div>
            <div className="ep-emojis">
              {emojis.map((em, i) => (
                <button
                  key={`${em}-${i}`}
                  type="button"
                  className={`ep-item ${value === em ? 'selected' : ''}`}
                  onClick={() => handleSelect(em)}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {!search && (
        <div className="ep-tabs">
          {Object.keys(CATEGORIES).map(cat => (
            <button
              key={cat}
              type="button"
              className={`ep-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => scrollToCategory(cat)}
              title={cat}
            >
              {CATEGORY_ICONS[cat]}
            </button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="ep-wrap" ref={pickerRef}>
      <button type="button" className="ep-trigger" onClick={() => setOpen(!open)}>
        <span className="ep-trigger-emoji">{value || '🙂'}</span>
      </button>

      {open && (
        isMobile ? (
          <div className="ep-fullscreen">
            {pickerContent}
          </div>
        ) : (
          <div className="ep-popover">
            {pickerContent}
          </div>
        )
      )}
    </div>
  );
};
