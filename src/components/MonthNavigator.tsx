import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

export const MonthNavigator: React.FC<Props> = ({ label, onPrev, onNext, className }) => (
  <div className={`month-nav ${className ?? ''}`}>
    <div className="month-btn" onClick={onPrev}><ChevronLeft size={16} /></div>
    <h2>{label}</h2>
    <div className="month-btn" onClick={onNext}><ChevronRight size={16} /></div>
  </div>
);
