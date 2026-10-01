// Manually verified from the public Google listing on 01-Oct-2026.
export const googleReviewsUrl = 'https://share.google/AzGvhqO3gnKDZMtKN';
export const googleRating = 4.9;
export const googleReviewsChecked = '01-Oct-2026';

const entries = [
  ['nikhil raj', '117985822809604714618', 5, 'If transparency and excellent customer service is what matters to you, then I strongly recommend this business.', true],
  ['Riyaz Razak', '101378029346692369357', 5, 'Excellent customer service, professional installation and reasonable pricing. Recommend everyone.'],
  ['sougandh rajk', '104578521790520770793', 5, 'Such a nice product.', true],
  ['vivek s', '101448882986644697421', 5, 'Professional service provided and i\u2019m 100% satisfied.'],
  ['Shahenshah aj', '106494109948325646431', 5, 'Very experts and quick response. Service quality and the products are the best in the market'],
  ['vinod ganga', '101638654143615580662', 5, 'Hi all , Seamlessly installed within a day and post support was good so far .'],
  ['Freedom Fighter', '105239279780567487334', 5, 'Customer service is soo gud & products is good & affordable....'],
  ['visruth vinod', '117256559601610025555', 5, 'Good professional guys, quality service at a reasonable cost'],
  ['Sarath Kumar', '111923057899541220257', 5, 'Good service, thanks for considering the urgency and working out of your scope for it'],
  ['\u0d07\u0d37\u0d4d\u0d1f\u0d4d\u0d1f\u0d02', '100213727282819031469', 5, 'good'],
  ['Sudheer Kumar', '107531969316891382963', 5, 'Technicians were friendly courteous and executed the work neatly'],
  ['Nehesh A', '114624128316993257626', 5, 'Excellent service'],
  ['Sreenath M S', '111089574188573685900', 5, 'Good service . \uD83D\uDC4D'],
  ['Sreejin', '106046081416032434805', 5, 'Good job guys.....\uD83D\uDC4D'],
  ['Sajeendran Pv', '108030433657367937432', 5, 'Fast and good .'],
  ['NIDHIN RAJ .M.K', '107353558415828839723', 5, 'Great Folks, Great Technology'],
  ['Ashi Ashish', '107642991058830519053', 5, 'Good service.'],
  ['BIPIN V', '115895707002566109423', 5, 'Good'],
  ['Nipun Navaneetham', '116405029662112437646', 5, '', false, 'Professionalism'],
  ['RESHABH', '113658822824942521043', 5, '', false, 'Responsiveness, Quality, Professionalism, Value'],
  ['junaid kunhabdulla', '102347112792978702938', 5, ''],
  ['niyaasveecy', '115010516656706606078', 4, ''],
  ['Vinodh Paleri', '100488477774642954525', 5, ''],
  ['Shermal Pc', '117370718713509343760', 5, ''],
  ['sabin k', '112255077401125437454', 5, ''],
  ['Shajith C', '112950867592710128589', 5, ''],
  ['Ramith O C', '113643204314269483675', 4, ''],
  ['Narendiran BT', '116432389749404191214', 5, ''],
  ['Navitha B Nambiar', '117488132552493949236', 5, ''],
  ['Nibin K', '103570520575028068355', 5, ''],
  ['Dhijin Raj', '107300156461714732987', 5, ''],
  ['Sruthina P', '112406599167748222366', 5, ''],
  ['Abhinav abhi', '108414373815230846989', 5, ''],
];

export const googleReviews = entries.map(([author, id, rating, text, excerpt = false, positives = '']) => ({
  author, id, rating, text, excerpt, positives,
  url: `https://www.google.com/maps/reviews/data=!4m5!14m4!1m3!1m2!1s${id}!2s0x3ba426785c6c7321:0x1ea8389b4ef08f62`,
}));
