import React, { useState } from 'react';

interface InputFieldProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: string;
  name?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  name,
  disabled = false,
  icon,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <div className="input-field">
      {label && <label className="input-field__label">{label}</label>}
      <div className={`input-field__box ${focused ? 'input-field--focused' : ''}`}>
        {icon && <span className="input-field__icon">{icon}</span>}
        <input
          type={type}
          name={name}
          className="input-field__input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
