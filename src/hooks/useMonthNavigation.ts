import { useState } from 'react';
import { format } from 'date-fns';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export const useMonthNavigation = () => {
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  const navigateMonth = (dir: -1 | 1) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setCurrentMonth(format(d, 'yyyy-MM'));
  };

  const formatMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${MONTHS[parseInt(month) - 1]} ${year}`;
  };

  return { currentMonth, setCurrentMonth, navigateMonth, formatMonthName };
};
