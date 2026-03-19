import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { format } from 'date-fns';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import { InputField } from '../components/InputField';
import { NumpadKey } from '../components/NumpadKey';
import { ChevronLeft } from 'lucide-react';

export const AddExpense: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState('Supermercado');
  const [type, setType] = useState<'shared' | 'personal'>('shared');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  useEffect(() => {
    Api.getCategories().then(setCategories).catch(console.error);
  }, []);

  const handleKey = (key: string) => {
    if (key === 'del') {
      setAmount(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else if (key === '.') {
      if (!amount.includes('.')) setAmount(prev => prev + '.');
    } else {
      setAmount(prev => prev === '0' ? key : prev + key);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parseFloat(amount) <= 0) return setError('Ingresa un monto válido');
    if (!description) return setError('Ingresa una descripción');

    try {
      setLoading(true);
      setError('');
      await Api.createExpense({
        description,
        amount: parseFloat(amount),
        category,
        date: format(new Date(), 'yyyy-MM-dd'),
        type,
        paid_by: user?.username || 'samuel',
      });
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setError('Error al guardar el gasto');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="u-vh-center">
        <div className="u-text-center">
          <div className="add-expense__success-icon">✓</div>
          <div className="settings__title">¡Gasto guardado!</div>
          <div className="settings__subtitle">Redirigiendo...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="add-expense">
      <div className="add-expense__header">
        <button onClick={() => navigate(-1)} className="add-expense__back">
          <ChevronLeft size={24} />
        </button>
        <h1 className="add-expense__title">Nuevo Gasto</h1>
      </div>

      <form onSubmit={handleSubmit} className="add-expense__form">
        <div className="add-expense__main-card">
          <div className="add-expense__display">
            <span className="add-expense__currency">€</span>
            <span className="add-expense__amount">{amount}</span>
          </div>

          <div className="add-expense__fields">
            <InputField
              label="Descripción"
              placeholder="¿En qué gastaste?"
              value={description}
              onChange={setDescription}
            />

            <div className="add-expense__field-group">
              <label className="input-field__label">Categoría</label>
              <div className="add-expense__category-search-wrapper">
                <input
                  type="text"
                  placeholder="Busca o selecciona categoría"
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                  onFocus={() => setCategoryDropdownOpen(true)}
                  className="add-expense__category-search-input"
                />
                {category && (
                  <div className="add-expense__category-tag">
                    {categories.find(c => c.name === category)?.emoji} {category}
                  </div>
                )}
                {categoryDropdownOpen && (
                  <div className="add-expense__category-dropdown">
                    {categories
                      .filter(cat =>
                        cat.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
                        categorySearch === ''
                      )
                      .map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          className={`add-expense__category-option ${category === cat.name ? 'add-expense__category-option--active' : ''}`}
                          onClick={() => {
                            setCategory(cat.name);
                            setCategorySearch('');
                            setCategoryDropdownOpen(false);
                          }}
                        >
                          <span>{cat.emoji}</span>
                          <span>{cat.name}</span>
                        </button>
                      ))}
                    <button
                      type="button"
                      className="add-expense__category-create-link"
                      onClick={() => {
                        setCategory(categorySearch || 'Nueva categoría');
                        setCategorySearch('');
                        setCategoryDropdownOpen(false);
                      }}
                    >
                      Crear nueva categoría...
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="add-expense__field-group">
              <label className="input-field__label">Tipo de Gasto</label>
              <div className="add-expense__tabs">
                <button
                  type="button"
                  className={`add-expense__tab ${type === 'shared' ? 'add-expense__tab--active' : ''}`}
                  onClick={() => setType('shared')}
                >
                  Compartido
                </button>
                <button
                  type="button"
                  className={`add-expense__tab ${type === 'personal' ? 'add-expense__tab--active' : ''}`}
                  onClick={() => setType('personal')}
                >
                  Personal
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="add-expense__numpad">
          <div className="add-expense__numpad-row">
            {['1', '2', '3'].map(k => <NumpadKey key={k} value={k} onClick={() => handleKey(k)} />)}
          </div>
          <div className="add-expense__numpad-row">
            {['4', '5', '6'].map(k => <NumpadKey key={k} value={k} onClick={() => handleKey(k)} />)}
          </div>
          <div className="add-expense__numpad-row">
            {['7', '8', '9'].map(k => <NumpadKey key={k} value={k} onClick={() => handleKey(k)} />)}
          </div>
          <div className="add-expense__numpad-row">
            <NumpadKey value="." onClick={() => handleKey('.')} />
            <NumpadKey value="0" onClick={() => handleKey('0')} />
            <NumpadKey value="del" onClick={() => handleKey('del')} isDelete />
          </div>
        </div>

        {error && <div className="add-expense__error-msg">{error}</div>}

        <div className="add-expense__cta">
          <Button
            label={loading ? 'Guardando...' : 'Añadir Gasto'}
            variant={user?.username === 'maria' ? 'maria' : 'samuel'}
            type="submit"
            fullWidth
            disabled={loading}
          />
        </div>
      </form>
    </div>
  );
};
