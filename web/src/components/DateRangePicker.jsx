import { useEffect, useRef, useState } from 'react';
import { MdCalendarToday } from 'react-icons/md';
import { formatDate } from '../utils/dateFormat';
import './DateRangePicker.css';

export default function DateRangePicker({ start, end, onChange, active }) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(start || '');
  const [draftEnd, setDraftEnd] = useState(end || '');
  const rootRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const label = start && end ? `${formatDate(start)} to ${formatDate(end)}` : 'Custom range';
  const toggle = () => {
    if (!open) {
      setDraftStart(start || '');
      setDraftEnd(end || '');
    }
    setOpen((value) => !value);
  };

  return (
    <div className="date-range" ref={rootRef}>
      <button type="button" className={`date-range__trigger ${active ? 'active' : ''}`} onClick={toggle} aria-expanded={open}>
        <MdCalendarToday />
        <span>{label}</span>
      </button>
      {open && (
        <div className="date-range__popover">
          <label>From<input type="date" value={draftStart} max={draftEnd || undefined} onChange={(event) => setDraftStart(event.target.value)} /></label>
          <label>To<input type="date" value={draftEnd} min={draftStart || undefined} onChange={(event) => setDraftEnd(event.target.value)} /></label>
          <button type="button" className="btn btn-primary btn-sm" disabled={!draftStart || !draftEnd} onClick={() => { onChange(draftStart, draftEnd); setOpen(false); }}>Apply range</button>
        </div>
      )}
    </div>
  );
}
