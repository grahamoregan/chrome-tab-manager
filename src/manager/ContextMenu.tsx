import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onClick?: () => void;
  submenu?: MenuItem[];
  disabled?: boolean;
  danger?: boolean;
}

export interface MenuState {
  x: number;
  y: number;
  items: (MenuItem | 'separator')[];
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8),
    });
  }, [menu.x, menu.y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y }} role="menu">
      <MenuList items={menu.items} onClose={onClose} />
    </div>
  );
}

function MenuList({ items, onClose }: { items: (MenuItem | 'separator')[]; onClose: () => void }) {
  return (
    <ul>
      {items.map((item, i) =>
        item === 'separator' ? (
          <li key={i} className="menu-sep" role="separator" />
        ) : (
          <li key={i} className={`menu-item ${item.submenu ? 'has-sub' : ''}`}>
            <button
              role="menuitem"
              disabled={item.disabled || (item.submenu && item.submenu.length === 0)}
              className={item.danger ? 'danger' : ''}
              onClick={() => {
                if (item.submenu) return;
                item.onClick?.();
                onClose();
              }}
            >
              <span className="grow">{item.label}</span>
              {item.submenu && <span aria-hidden>▸</span>}
            </button>
            {item.submenu && item.submenu.length > 0 && (
              <div className="menu submenu">
                <MenuList items={item.submenu} onClose={onClose} />
              </div>
            )}
          </li>
        ),
      )}
    </ul>
  );
}
