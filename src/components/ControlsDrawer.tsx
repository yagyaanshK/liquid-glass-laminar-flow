import { useState, useRef, useEffect, ReactNode } from 'react';

interface ControlsDrawerProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

export function ControlsDrawer({ children, defaultOpen = false }: ControlsDrawerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <button 
        className={`controls-burger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Controls"
      >
        <span />
        <span />
        <span />
      </button>

      {isOpen && (
        <div 
          className="controls-overlay" 
          onClick={() => setIsOpen(false)}
        />
      )}

      <div 
        ref={drawerRef} 
        className={`controls-drawer ${isOpen ? 'open' : ''}`}
      >
        {children}
      </div>
    </>
  );
}
