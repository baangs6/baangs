import './RangeSwitch.css';

const ranges = ['day', 'week', 'month', 'year'];

export default function RangeSwitch({ value, onChange }) {
  return (
    <div className="cir-tabs" role="tablist" aria-label="Report range">
      {ranges.map((range) => (
        <span className="cir-tabs__option" key={range}>
          <input
            className="cir-tabs__radio"
            type="radio"
            name="learning-range"
            id={`learning-range-${range}`}
            checked={value === range}
            onChange={() => onChange(range)}
          />
          <label className="cir-tabs__tab" htmlFor={`learning-range-${range}`} role="tab" aria-selected={value === range}>
            {range[0].toUpperCase() + range.slice(1)}
          </label>
        </span>
      ))}
    </div>
  );
}
