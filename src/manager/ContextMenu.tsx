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

const MARGIN = 8;

/**
 * Keeps a fixed-position box inside the viewport. `prefer` is where it would
 * like to be; `flipLeftX` is where its right edge should sit if it doesn't fit
 * to the right (used by submenus to open leftwards).
 */
function placeBox(el: HTMLElement, prefer: { x: number; y: number }, flipLeftX?: number) {
  const { width, height } = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = prefer.x;
  if (x + width > vw - MARGIN) x = flipLeftX !== undefined ? flipLeftX - width : vw - MARGIN - width;
  x = Math.max(MARGIN, x);
  let y = prefer.y;
  if (y + height > vh - MARGIN) y = vh - MARGIN - height;
  y = Math.max(MARGIN, y);
  return { x, y };
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (ref.current) setPos(placeBox(ref.current, { x: menu.x, y: menu.y }));
  }, [menu]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.menu')) onClose();
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
    <div
      ref={ref}
      className="menu"
      // Hidden until measured, so it never flashes off-screen.
      style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}
      role="menu"
    >
      <MenuList items={menu.items} onClose={onClose} />
    </div>
  );
}

function MenuList({ items, onClose }: { items: (MenuItem | 'separator')[]; onClose: () => void }) {
  const [open, setOpen] = useState<{ index: number; anchor: DOMRect } | null>(null);
  return (
    <ul>
      {items.map((item, i) =>
        item === 'separator' ? (
          <li key={i} className="menu-sep" role="separator" />
        ) : (
          <li
            key={i}
            className={`menu-item ${item.submenu ? 'has-sub' : ''} ${open?.index === i ? 'open' : ''}`}
            onMouseEnter={(e) => setOpen(item.submenu?.length ? { index: i, anchor: e.currentTarget.getBoundingClientRect() } : null)}
          >
            <button
              role="menuitem"
              aria-haspopup={item.submenu ? 'menu' : undefined}
              aria-expanded={item.submenu ? open?.index === i : undefined}
              disabled={item.disabled || (item.submenu && item.submenu.length === 0)}
              className={item.danger ? 'danger' : ''}
              onFocus={(e) => item.submenu?.length && setOpen({ index: i, anchor: e.currentTarget.parentElement!.getBoundingClientRect() })}
              onClick={(e) => {
                if (item.submenu) {
                  setOpen({ index: i, anchor: e.currentTarget.parentElement!.getBoundingClientRect() });
                  return;
                }
                item.onClick?.();
                onClose();
              }}
            >
              <span className="grow">{item.label}</span>
              {item.submenu && <span aria-hidden>▸</span>}
            </button>
            {item.submenu && open?.index === i && <Submenu items={item.submenu} anchor={open.anchor} onClose={onClose} />}
          </li>
        ),
      )}
    </ul>
  );
}

function Submenu({ items, anchor, onClose }: { items: MenuItem[]; anchor: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (ref.current) setPos(placeBox(ref.current, { x: anchor.right - 2, y: anchor.top - 5 }, anchor.left + 2));
  }, [anchor]);
  return (
    <div
      ref={ref}
      className="menu submenu"
      role="menu"
      style={{ left: pos?.x ?? anchor.right, top: pos?.y ?? anchor.top, visibility: pos ? 'visible' : 'hidden' }}
    >
      <MenuList items={items} onClose={onClose} />
    </div>
  );
}
