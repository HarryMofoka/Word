import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import type { FAQItemData } from '../../types';

interface AccordionProps {
  items: FAQItemData[];
}

export const Accordion: React.FC<AccordionProps> = ({ items }) => {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  const toggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            style={{
              borderBottom: '1px solid var(--line)',
            }}
          >
            <button
              type="button"
              id={`faq-btn-${item.id}`}
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${item.id}`}
              onClick={() => toggle(item.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '20px',
                paddingBlock: '22px',
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                color: 'var(--ink)',
              }}
            >
              <span
                style={{
                  fontSize: 'clamp(16px, 1.4vw, 18px)',
                  fontWeight: 500,
                  letterSpacing: '-0.015em',
                }}
              >
                {item.question}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  width: '28px',
                  height: '28px',
                  borderRadius: '999px',
                  border: '1px solid var(--line)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isOpen ? 'var(--ink)' : 'var(--sub)',
                  backgroundColor: isOpen ? 'var(--soft)' : 'transparent',
                  transition: 'background-color 0.2s ease, color 0.2s ease',
                }}
                aria-hidden="true"
              >
                {isOpen ? <Minus size={14} /> : <Plus size={14} />}
              </span>
            </button>
            <div
              id={`faq-panel-${item.id}`}
              role="region"
              aria-labelledby={`faq-btn-${item.id}`}
              hidden={!isOpen}
              style={{
                paddingBottom: '22px',
                paddingRight: '40px',
              }}
            >
              <p className="body-md" style={{ maxWidth: '680px' }}>
                {item.answer}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

