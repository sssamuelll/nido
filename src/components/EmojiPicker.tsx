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
    ? { 'Resultados': Object.values(CATEGORIES).flat().filter(e => e.includes(search)) }
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
