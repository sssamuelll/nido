import React from 'react';

interface BalanceCardProps {
  samuelBalance: number;
  mariaBalance: number;
  owesWho: string;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({ 
  samuelBalance, 
  mariaBalance, 
  owesWho 
}) => {
  return (
    <div className="balance-card">
      <div className="balance-title">Quién debe a quién</div>
      <div className="balance-amount">{owesWho}</div>
      
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginTop: '1rem',
        fontSize: '0.875rem',
        opacity: 0.9
      }}>
        <div>
          Samuel: €{samuelBalance.toFixed(2)}
        </div>
        <div>
          María: €{mariaBalance.toFixed(2)}
        </div>
      </div>
    </div>
  );
};