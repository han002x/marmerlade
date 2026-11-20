export default function BrandMark({ size = 24, decorative = false }: { size?: number; decorative?: boolean }) {
  return <img className="brand-mark" src={`${import.meta.env.BASE_URL}favicon.svg`}
    alt={decorative ? '' : 'Marmerlade'} width={size} height={size} />;
}
