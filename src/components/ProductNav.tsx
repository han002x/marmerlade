import { Icon } from './Icon';
import { saveForNavigation } from '../persist';

const products = [
  { id: 'canvas', label: 'Diagrams', href: '#/diagrams', icon: 'shapes' },
  { id: 'wiki', label: 'Wiki', href: '#/wiki', icon: 'page' },
  { id: 'slides', label: 'Slides', href: '#/slides', icon: 'deck' },
] as const;

export default function ProductNav({ current }: { current: typeof products[number]['id'] }) {
  return (
    <header className="product-header">
      <div className="product-brand">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Marmerlade" width="24" height="24" />
        <span aria-hidden="true">marmerlade</span>
      </div>
      <nav aria-label="Products">
        {products.map(({ id, label, href, icon }) => (
          <a key={id} href={href} aria-current={id === current ? 'location' : undefined} onClick={saveForNavigation}>
            <Icon name={icon} size={16} />
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}
