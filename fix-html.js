const fs = require('fs');
const p = 'c:/Users/S15/OneDrive/Desktop/New-Saarthi/active-donation.html';
let c = fs.readFileSync(p, 'utf8');
const marker = '</script>\n</body>\n</html>';
const idx = c.indexOf(marker);
if (idx !== -1) {
  fs.writeFileSync(p, c.substring(0, idx + marker.length));
  console.log('Fixed!');
} else {
  console.log('Marker not found');
}
