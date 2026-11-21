export default function LibrarySearch({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return <input className="wk-library-search" type="search" aria-label={label}
    placeholder={label} value={value} onChange={event => onChange(event.target.value)} />;
}
