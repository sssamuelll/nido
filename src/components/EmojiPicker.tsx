import React, { useState, useRef, useEffect } from 'react';

const CATEGORIES: Record<string, string[]> = {
  'Frecuentes': ['🍽️','🛒','🏠','💡','🚗','💊','🎉','📱','💰','✈️','☕','🎬'],
  'Caras': [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇',
    '🥰','😍','🤩','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗',
    '🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥',
    '😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶',
    '🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐',
  ],
  'Personas': [
    '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘',
    '🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜',
    '👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂',
    '👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄',
  ],
  'Naturaleza': [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮',
    '🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆',
    '🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞',
    '🌸','🌺','🌻','🌹','🌷','🌱','🌲','🌳','🌴','🌵','🍀','🍁',
  ],
  'Comida': [
    '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒',
    '🍑','🥭','🍍','🥥','🥝','🍅','🥑','🥦','🥬','🥒','🌶️','🫑',
    '🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🍞','🥖','🥨','🧀',
    '🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟',
    '🍕','🫓','🥪','🌮','🌯','🫔','🥗','🥘','🫕','🍝','🍜','🍲',
    '🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮',
    '🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬',
    '🍫','🍿','🍩','🍪','🌰','🥜','🍯','☕','🫖','🍵','🧃','🥤',
    '🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾',
  ],
  'Actividades': [
    '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓',
    '🏸','🏒','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊',
    '🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️',
    '🤸','🤼','🤽','🤾','🤺','⛹️','🧘','🏄','🏊','🚣','🧗','🚴',
    '🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺',
    '🪗','🎸','🎻','🎲','♟️','🎯','🎳','🎮','🕹️','🧩',
  ],
  'Viajes': [
    '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚',
    '🚛','🚜','🏍️','🛵','🚲','🛴','🛺','🚔','🚍','🚘','🚖','🛞',
    '🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆',
    '🛩️','✈️','🛫','🛬','🪂','💺','🚀','🛸','🚁','🛶','⛵','🚤',
    '🛥️','🛳️','⛴️','🚢','⚓','🪝','⛽','🚧','🚦','🚥','🗺️','🗿',
    '🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️',
    '🌋','⛰️','🏔️','🗻','🏕️','🛖','🏠','🏡','🏢','🏣','🏤','🏥',
  ],
  'Objetos': [
    '⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀',
    '📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻',
    '🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','📡','🔋','🪫',
    '🔌','💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','🪙',
    '💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️',
    '🪚','🔩','⚙️','🪤','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️',
    '🔑','🗝️','🔒','🔓','🔏','🔐','📦','📫','📬','📭','📮','🗳️',
    '✏️','✒️','🖋️','🖊️','🖌️','🖍️','📝','💼','📁','📂','🗂️','📅',
    '📆','🗒️','🗓️','📇','📈','📉','📊','📋','📌','📍','📎','🖇️',
  ],
  'Símbolos': [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹',
    '❣️','💕','💞','💓','💗','💖','💘','💝','🔴','🟠','🟡','🟢',
    '🔵','🟣','⚫','⚪','🟤','✅','❌','⭕','💯','🔥','✨','⭐',
    '🌟','💫','🎵','🎶','💤','💢','💬','👁️‍🗨️','🏁','🚩','🎌','🏴',
    '🏳️','🏳️‍🌈','♻️','⚜️','🔱','📛','🔰','⭕','✅','☑️','✔️','❌',
    '❎','➕','➖','➗','✖️','♾️','‼️','⁉️','❓','❔','❕','❗',
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

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Frecuentes');
  const pickerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    setSearch('');
  };

  const scrollToCategory = (cat: string) => {
    setActiveCategory(cat);
    categoryRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filteredCategories = search.trim()
    ? { 'Resultados': Object.values(CATEGORIES).flat().filter(e => e.includes(search)) }
    : CATEGORIES;

  return (
    <div className="ep-wrap" ref={pickerRef}>
      <button type="button" className="ep-trigger" onClick={() => setOpen(!open)}>
        <span className="ep-trigger-emoji">{value || '🙂'}</span>
      </button>

      {open && (
        <div className="ep-popover">
          <div className="ep-search">
            <svg width="14" height="14" fill="none" stroke="var(--tm)" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar emoji..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
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
        </div>
      )}
    </div>
  );
};
