const cfonts = require('cfonts');

const showBanner = () => {
  cfonts.say('Abhigyan-IIIT Delhi', {
    font: 'tiny',
    align: 'center',
    colors: ['white'],
    letterSpacing: 1,
    lineHeight: 1,
    space: true,
    maxLength: '0',
    gradient: false,
    independentGradient: false,
    transitionGradient: false,
    env: 'node',
  });

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Developed by: Abhigyan Raj
Stack: MERN
GitHub: https://github.com/AbhigyanRaj
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
};

module.exports = showBanner;