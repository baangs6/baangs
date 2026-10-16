import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MdArrowForward, MdCall, MdMenu, MdClose, MdVideocam, MdBuild, MdHome, MdCheckCircle, MdEast, MdFence, MdLocalParking, MdBatteryChargingFull } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';
import './Home.css';
import GoogleTestimonials, { ReviewStars } from '../components/GoogleTestimonials';
import SiteEnquiryForm from '../components/SiteEnquiryForm';
import { googleRating, googleReviews } from '../data/googleReviews';

const whatsapp = 'https://wa.me/918330033280?text=Hello%20BAANGS%2C%20I%20would%20like%20to%20discuss%20my%20security%20requirements.';
const enquiry = service => `https://wa.me/918330033280?text=${encodeURIComponent(`Hello BAANGS, I would like to enquire about ${service}.`)}`;
const services = [
  { icon: MdVideocam, category: 'CCTV Sales & Installation', title: 'Precision Camera Coverage', text: 'Find the right cameras, recording system, and coverage for your home, shop, or commercial workplace.', image: 'cctv', badge: 'CCTV surveillance', label: 'Explore your options', href: '#contact' },
  { icon: MdBuild, category: 'Repairs & Maintenance', title: 'Field Diagnostics & AMC', text: 'Camera offline? Recording issues? Our team repairs your system and helps keep it performing with regular care.', image: 'maintenance', badge: 'Repair & maintenance', label: 'Request a service visit', to: '/complaint' },
  { icon: MdHome, category: 'Home Automation', title: 'Connected Living Spaces', text: 'Talk to us about connected lighting, smart door locks, video doorphones, and solutions that make everyday living easier.', image: 'automation', badge: 'Smart living', label: 'Talk to our team', href: enquiry('home automation') },
  { icon: MdFence, category: 'Automated Gates', title: 'Motorized Sliding & Swing Gates', text: 'Convenient motorized entry for homes and businesses. Talk to us about gate automation, installation, and servicing.', image: 'gate', badge: 'Automated entry', label: 'Enquire about automated gates', href: enquiry('automated gates') },
  { icon: MdLocalParking, category: 'Boom Barriers', title: 'Vehicle Access Control', text: 'Manage vehicle access at parking areas and property entrances with automated boom barrier installation and maintenance.', image: 'barrier', badge: 'Access control', label: 'Enquire about boom barriers', href: enquiry('boom barriers') },
  { icon: MdBatteryChargingFull, category: 'Online UPS & Power Backup', title: 'Power for What Matters', text: 'Keep essential equipment running through power interruptions. Discuss UPS sales, installation, and service with our team.', image: 'ups', badge: 'Power backup', label: 'Enquire about UPS', href: enquiry('UPS power backup') },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  return <div className="baangs-site">
    <a className="site-skip" href="#home-main">Skip to content</a>
    <div className="site-utility"><div><span className="site-utility-status">Serving Kerala</span><span className="site-utility-area">Thalassery &amp; Kannur | Sales, installation &amp; service</span></div>
      <div><a href="tel:+918330033280"><MdCall /> 83300 33280</a><a href={whatsapp} target="_blank" rel="noreferrer"><FaWhatsapp /> WhatsApp our team</a></div>
    </div>
    <header className="site-header">
      <Link to="/" className="site-brand" aria-label="BAANGS home">BAANGS<span>CCTV &amp; HOME AUTOMATION</span></Link>
      <button ref={menuButton} className="site-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <MdClose /> : <MdMenu />}</button>
      <nav id="site-navigation" className={menuOpen ? 'is-open' : ''} aria-label="Main navigation" onClick={() => setMenuOpen(false)} onKeyDown={event => { if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); } }}>
        <a href="#services">Our services</a><a href="#approach">How we work</a><a href="#testimonials">Testimonials</a><a href="#contact">Contact</a>
        <Link to="/login">Employee login</Link><Link className="site-button small" to="/complaint">Customer support <MdArrowForward /></Link>
      </nav>
    </header>
    <main id="home-main">
      <section className="site-hero">
        <div className="site-hero-copy"><p className="site-kicker site-hero-eyebrow">YOUR SPACE. YOUR PEACE OF MIND.</p>
          <h1>CCTV sales<br />&amp; services.</h1>
          <p>From a new installation to the cameras you already rely on. BAANGS helps you take care of what matters across homes, retail spaces, and workplaces in Kerala.</p>
          <div className="site-actions"><a className="site-button" href="#contact">Get a quote <MdArrowForward /></a><a className="site-call" href="tel:+918330033280"><MdCall /> Call our team</a></div>
          <div className="site-hero-trust"><div className="site-hero-note"><span><MdCheckCircle /> Homes</span><span><MdCheckCircle /> Shops</span><span><MdCheckCircle /> Workplaces</span></div>
            <a className="site-hero-rating" href="#testimonials"><ReviewStars rating={googleRating} /><strong>{googleRating}/5</strong><span>{googleReviews.length} Google reviews</span></a></div>
        </div>
        <div className="site-hero-media"><img src="/images/home/cctv.jpg" alt="Technician installing a CCTV camera" fetchPriority="high" width="800" height="600" />
          <div className="site-photo-caption"><MdCheckCircle /><div><strong>Local installation. Lasting support.</strong><span>Thalassery, Kannur &amp; surrounding areas</span></div><MdVideocam /></div>
        </div>
      </section>
      <div className="site-service-strip">{[['ENTITY', 'BAANGS Technomac LLP'], ['SERVICE RANGE', 'Installation & Repair'], ['SUPPORT', 'From planning to follow-up'], ['COVERAGE', 'Thalassery & Kannur']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <section id="services" className="site-section">
        <div className="site-section-heading"><div><p className="site-kicker">WHAT WE DO</p><h2>Security starts with the right<br className="site-desktop-break" /> solution.</h2></div><p>Setting up a new space or looking after an existing system? Let's find what works for your requirements.</p></div>
        <div className="site-service-grid">{services.map(({ icon: Icon, ...service }) => <article className="site-service" key={service.image}>
          <div className="site-service-image"><img src={`/images/home/${service.image}.jpg`} alt={service.title} width="800" height="450" loading="lazy" /><span>{service.badge}</span></div>
          <div className="site-service-copy"><div className="site-service-category"><Icon /> {service.category}</div><h3>{service.title}</h3><p>{service.text}</p>
            {service.to ? <Link to={service.to}>{service.label} <MdEast /></Link> : <a href={service.href} {...(service.href.startsWith('https:') ? { target: '_blank', rel: 'noreferrer' } : {})}>{service.label} <MdEast /></a>}
          </div>
        </article>)}</div>
      </section>
      <section id="approach" className="site-approach site-section">
        <div><p className="site-kicker">FROM FIRST CALL TO FOLLOW-UP</p><h2>A clear way forward.</h2><p>One dedicated team to discuss your requirements, plan your installation, and help with service requests without middlemen.</p><a href="#contact" className="site-text-link">Let's talk about your space <MdArrowForward /></a></div>
        <ol>{[['Tell us what you need', 'Share your property location and what you want to secure or fix. We inspect coverage zones, wiring routes, and lighting requirements.'], ['Plan the right solution', 'Discuss camera coverage, equipment choices, and installation requirements with our team before work begins.'], ['Stay connected', 'Get support for connected setups and mobile access. Register service requests online and track their progress whenever you need us.']].map(([title, text], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
      </section>
      <GoogleTestimonials />
      <section className="site-support site-section"><div><p className="site-kicker">ALREADY A CUSTOMER?</p><h2>We're here for the next step.</h2><p>Report a problem with your system or check an existing service request.</p></div><div className="site-actions"><Link className="site-button small" to="/complaint">Request support <MdArrowForward /></Link><Link className="site-text-link" to="/track">Track a request <MdArrowForward /></Link></div></section>
      <section id="contact" className="site-contact site-section"><div><p className="site-kicker">LET'S CONNECT</p><h2>Let's talk security.</h2><p>Sales enquiries, installation plans, or a system that needs attention. Start a conversation with BAANGS.</p>
        <a className="site-contact-phone" href="tel:+918330033280">83300 33280 <MdArrowForward /></a><a className="site-alternate-phone" href="tel:+918848133004">Alternate: 88481 33004</a>
        <address><h3>BAANGS Technomac LLP</h3><p>1/278 &amp; 1/279, Vadakkumbad<br />Thalassery, Kannur<br />Kerala, India 670105</p><a href="mailto:support@baangs.in">support@baangs.in</a><a href={whatsapp} target="_blank" rel="noreferrer">Message on WhatsApp <MdArrowForward /></a></address>
      </div><SiteEnquiryForm /></section>
    </main>
    <footer className="site-footer"><div className="site-footer-main"><Link className="site-brand" to="/">BAANGS<span>CCTV &amp; HOME AUTOMATION</span></Link><span>&copy; {new Date().getFullYear()} BAANGS Technomac LLP. All rights reserved.</span><nav aria-label="Footer navigation"><a href="#services">Our services</a><a href="#approach">How we work</a><a href="#contact">Contact</a></nav></div>
      <div className="site-footer-bottom"><span>1/278 &amp; 1/279, Vadakkumbad, Thalassery, Kannur, Kerala 670105</span><a href={whatsapp} target="_blank" rel="noreferrer"><FaWhatsapp /> WhatsApp our team</a></div>
    </footer>
  </div>;
}
