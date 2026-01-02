import fs from 'fs';
import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();
fs.writeFileSync('temp_keys.json', JSON.stringify(vapidKeys, null, 2));
console.log('Keys written to temp_keys.json');
