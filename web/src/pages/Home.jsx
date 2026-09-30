import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MdArrowForward, MdCall, MdMenu, MdClose, MdVideocam, MdBuild, MdHome, MdCheckCircle, MdEast, MdFence, MdLocalParking, MdBatteryChargingFull } from 'react-icons/md';
import './Home.css';

const whatsapp = 'https://wa.me/918330033280?text=Hello%20BAANGS%2C%20I%20would%20like%20a%20quote%20for%20CCTV%20sales%20and%20installation.';
const serviceEnquiry = (service) => `https://wa.me/918330033280?text=${encodeURIComponent(`Hello BAANGS, I would like to enquire about ${service}.`)}`;
const services = [
  { icon: MdVideocam, title: 'CCTV sales & installation', text: 'Find the right cameras, recording system and coverage for your home, shop or workplace.', image: 'photo-1556782274-d247b2a5ea85', label: 'Explore your options', href: whatsapp },
  { icon: MdBuild, title: 'Repairs & maintenance', text: 'Camera offline? Recording issues? Request a service visit for your existing CCTV system.', image: 'photo-1534157327728-accacabda257', label: 'Request a service', to: '/complaint' },
  { icon: MdHome, title: 'Home automation', text: 'Talk to us about connected solutions that make your everyday spaces easier to manage.', image: 'photo-1486406146926-c627a92ad1ab', label: 'Talk to our team', href: whatsapp },
  { icon: MdFence, title: 'Automated Gate', text: 'Convenient entry for homes and businesses. Talk to us about gate automation, installation and servicing.', label: 'Enquire about automated gates', href: serviceEnquiry('automated gates'), visual: 'gate' },
  { icon: MdLocalParking, title: 'Boom Barrier', text: 'Manage vehicle access at parking areas and property entrances with boom barrier installation and service.', label: 'Enquire about boom barriers', href: serviceEnquiry('boom barriers'), visual: 'barrier' },
  { icon: MdBatteryChargingFull, title: 'UPS', text: 'Power backup for your essential equipment. Discuss UPS sales, installation and service with our team.', label: 'Enquire about UPS', href: serviceEnquiry('UPS power backup'), visual: 'ups' },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="baangs-site">
    <a className="site-skip" href="#home-main">Skip to content</a>
    <header className="site-header">
      <Link to="/" className="site-brand" aria-label="BAANGS home">BAANGS<span>CCTV & HOME AUTOMATION</span></Link>
      <button className="site-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <MdClose /> : <MdMenu />}</button>
      <nav id="site-navigation" className={menuOpen ? 'is-open' : ''} aria-label="Main navigation" onClick={() => setMenuOpen(false)}>
        <a href="#services">Our services</a><a href="#approach">How we work</a><a href="#contact">Contact</a>
        <Link to="/login">Employee login</Link><Link className="site-button small" to="/complaint">Customer support <MdArrowForward /></Link>
      </nav>
    </header>
    <main id="home-main">
      <section className="site-hero">
        <img className="site-hero-image" src="https://images.unsplash.com/photo-1567167680325-2203584962b2?auto=format&fit=crop&w=2200&q=85" alt="Wall-mounted CCTV cameras" fetchPriority="high" />
        <div className="site-hero-copy">
          <p className="site-kicker">YOUR SPACE. YOUR PEACE OF MIND.</p>
          <h1>CCTV sales<br />& services.</h1>
          <p>From a new installation to the cameras you already rely on. BAANGS helps you take care of what matters.</p>
          <div className="site-actions"><a className="site-button" href={whatsapp} target="_blank" rel="noreferrer">Get a quote <MdArrowForward /></a><a className="site-call" href="tel:+918330033280"><MdCall /> Call our team</a></div>
          <div className="site-hero-note"><MdCheckCircle /> Homes <span>/</span> Shops <span>/</span> Workplaces</div>
        </div>
      </section>
      <div className="site-service-strip"><span>BAANGS TECHNOMAC LLP</span><span>Installation</span><span>Service & repair</span><span>Maintenance</span></div>
      <section id="services" className="site-section">
        <div className="site-section-heading"><div><p className="site-kicker">WHAT WE DO</p><h2>Security starts with<br />the right solution.</h2></div><p>Setting up a new space or looking after an existing system? Let’s find what works for you.</p></div>
        <div className="site-service-grid">{services.map(({ icon: Icon, ...service }) => <article className="site-service" key={service.title}>
          {service.image ? <img src={`https://images.unsplash.com/${service.image}?auto=format&fit=crop&w=800&q=80`} alt={service.title === 'Home automation' ? 'Modern building exterior' : 'Installed security camera'} loading="lazy" /> : <div className={`site-service-symbol ${service.visual}`} aria-hidden="true"><Icon /></div>}
          <div className="site-service-title"><Icon /><h3>{service.title}</h3></div><p>{service.text}</p>
          {service.to ? <Link to={service.to}>{service.label} <MdEast /></Link> : <a href={service.href} target="_blank" rel="noreferrer">{service.label} <MdEast /></a>}
        </article>)}</div>
      </section>
      <section id="approach" className="site-approach site-section">
        <div><p className="site-kicker">FROM FIRST CALL TO FOLLOW-UP</p><h2>A clear way forward.</h2><p>One team to discuss your requirements, plan your installation and help with service requests.</p><a href={whatsapp} target="_blank" rel="noreferrer" className="site-text-link">Let’s talk about your space <MdArrowForward /></a></div>
        <ol>{[['Tell us what you need', 'Share your location and what you want to secure or fix.'], ['Plan the right solution', 'Discuss camera coverage, equipment and installation requirements with our team.'], ['Stay connected', 'Register a service request online and track its progress whenever you need support.']].map(([title, text], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
      </section>
      <section className="site-support site-section"><div><p className="site-kicker">ALREADY A CUSTOMER?</p><h2>We’re here for the next step.</h2><p>Report a problem with your system or check an existing service request.</p></div><div className="site-actions"><Link className="site-button" to="/complaint">Request support <MdArrowForward /></Link><Link className="site-text-link" to="/track">Track a request <MdArrowForward /></Link></div></section>
      <section id="contact" className="site-contact site-section"><div><p className="site-kicker">LET’S CONNECT</p><h2>Let’s talk security.</h2><p>Sales enquiries, installation plans or a system that needs attention. Start a conversation with BAANGS.</p><a className="site-contact-phone" href="tel:+918330033280">83300 33280 <MdArrowForward /></a><a href="tel:+918848133004">Alternate: 88481 33004</a></div><address><h3>BAANGS Technomac LLP</h3><p>1/278 & 1/279, Vadakkumbad<br />Thalassery, Kannur<br />Kerala, India 670105</p><a href="mailto:support@baangs.in">support@baangs.in</a><a href={whatsapp} target="_blank" rel="noreferrer">Message on WhatsApp <MdArrowForward /></a></address></section>
    </main>
    <footer className="site-footer"><Link className="site-brand" to="/">BAANGS</Link><span>&copy; {new Date().getFullYear()} BAANGS Technomac LLP</span><Link to="/login">Employee login <MdArrowForward /></Link></footer>
  </div>;
}
