import { useState } from 'react';
import { MdArrowForward, MdOpenInNew, MdStar, MdStarBorder, MdExpandMore, MdExpandLess } from 'react-icons/md';
import { googleReviews, googleReviewsUrl, googleRating, googleReviewsChecked } from '../data/googleReviews';

export function ReviewStars({ rating }) {
  return <span className="site-review-stars" role="img" aria-label={`${rating} out of 5 stars`}>
    {Array.from({ length: 5 }, (_, i) => i < Math.round(rating)
      ? <MdStar key={i} aria-hidden="true" /> : <MdStarBorder key={i} aria-hidden="true" />)}
  </span>;
}

export default function GoogleTestimonials() {
  const [expanded, setExpanded] = useState(false);
  const [rating, setRating] = useState('all');
  const filtered = googleReviews.filter(review => rating === 'all' || review.rating === Number(rating));
  const visible = expanded ? filtered : filtered.slice(0, 6);

  return <section id="testimonials" className="site-section site-testimonials" aria-labelledby="testimonials-title">
    <div className="site-section-heading">
      <div><p className="site-kicker">CUSTOMER TESTIMONIALS</p><h2 id="testimonials-title">In our customers' words.</h2><p>Customer reviews of BAANGS Technomac LLP on Google.</p></div>
      <a href={googleReviewsUrl} className="site-reviews-summary" target="_blank" rel="noopener noreferrer">
        <strong>{googleRating}<small>/ 5</small></strong>
        <span><ReviewStars rating={googleRating} /><span>{googleReviews.length} Google reviews <MdOpenInNew aria-hidden="true" /></span></span>
      </a>
    </div>
    <div className="site-reviews-toolbar">
      <div className="site-review-filters" role="group" aria-label="Filter reviews by rating">
        {['all', '5', '4'].map(value => <button key={value} type="button" aria-pressed={rating === value}
          onClick={() => { setRating(value); setExpanded(false); }}>
          {value === 'all' ? 'All reviews' : <>{value} <MdStar aria-hidden="true" /></>}
          <span>{value === 'all' ? googleReviews.length : googleReviews.filter(r => r.rating === Number(value)).length}</span>
        </button>)}
      </div>
      <span className="site-reviews-date">Checked {googleReviewsChecked}</span>
    </div>
    <div id="google-review-list" className="site-reviews-grid">
      {visible.map(review => <article className="site-review" key={review.id}>
        <div className="site-review-author"><span className="site-review-avatar" aria-hidden="true">{review.author.trim().slice(0, 1).toUpperCase()}</span>
          <div><h3>{review.author}</h3><span>Google review</span></div><MdOpenInNew aria-hidden="true" /></div>
        <ReviewStars rating={review.rating} />
        {review.text ? <blockquote>{review.text}{review.excerpt && '...'}</blockquote>
          : <p className="site-review-no-comment">{review.positives ? `Positive feedback: ${review.positives}` : 'Star rating only'}</p>}
        <a className="site-review-source" href={review.url} target="_blank" rel="noopener noreferrer">{review.excerpt ? 'Read full review on Google' : 'View on Google'} <MdArrowForward aria-hidden="true" /></a>
      </article>)}
    </div>
    <div className="site-reviews-actions">
      {filtered.length > 6 && <button type="button" className="site-reviews-expand" aria-expanded={expanded} aria-controls="google-review-list" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Show fewer reviews' : `Show all ${filtered.length} reviews`} {expanded ? <MdExpandLess /> : <MdExpandMore />}
      </button>}
      <a className="site-text-link" href={googleReviewsUrl} target="_blank" rel="noopener noreferrer">Read latest reviews on Google <MdOpenInNew /></a>
    </div>
  </section>;
}
