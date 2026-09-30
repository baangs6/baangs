import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api';
import './CustomerFeedback.css';

export default function CustomerFeedback() {
  const { jobId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [job, setJob] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    publicApi.feedback(jobId, token)
      .then(({ data }) => { if (active) setJob(data); })
      .catch((err) => { if (active) setError(err.response?.data?.detail || 'Unable to open this feedback link.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobId, token]);

  const submit = async (event) => {
    event.preventDefault();
    if (!rating || saving) return;
    setSaving(true);
    setError('');
    try {
      await publicApi.submitFeedback(jobId, { token, rating, comment });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to save your feedback. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <main className="customer-feedback-page">
    <Link className="customer-feedback-brand" to="/">BAANGS</Link>
    <section className="customer-feedback-content">
      <p className="customer-feedback-kicker">SERVICE FEEDBACK</p>
      {loading ? <p>Loading your service details...</p> : submitted ? <>
        <h1>Thank you for your feedback.</h1><p>Your rating helps us improve our service.</p>
      </> : error && !job ? <><h1>Feedback unavailable</h1><p role="alert">{error}</p></> : <>
        <h1>How was your service?</h1>
        <p>Tell us about {job.technician_name ? `${job.technician_name}'s` : 'your technician’s'} work on {job.work_type || 'your service'}.</p>
        <p className="customer-feedback-job">{job.job_id}</p>
        {job.rating != null ? <p>You rated this service {job.rating} out of 5 stars. Thank you.</p> :
          <form onSubmit={submit}>
            <fieldset className="customer-feedback-stars">
              <legend>Your rating</legend>
              <div role="group" aria-label="Rate the service from 1 to 5 stars">
                {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={value <= rating ? 'selected' : ''}
                  aria-label={`${value} star${value === 1 ? '' : 's'}`} aria-pressed={rating === value} onClick={() => setRating(value)}>★</button>)}
              </div>
            </fieldset>
            <label htmlFor="customer-feedback-comment">Your comments (optional)</label>
            <textarea id="customer-feedback-comment" maxLength={1000} rows={5} value={comment}
              onChange={(event) => setComment(event.target.value)} placeholder="What went well? What could we improve?" />
            {error && <p role="alert" className="customer-feedback-error">{error}</p>}
            <button className="customer-feedback-submit" type="submit" disabled={!rating || saving}>{saving ? 'Submitting...' : 'Submit feedback'}</button>
          </form>}
      </>}
    </section>
    <p className="customer-feedback-footer">BAANGS Technomac LLP · Thalassery, Kannur</p>
  </main>;
}
