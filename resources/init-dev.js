import { networkInterfaces } from 'os';
import fs from 'fs';

export function initDev(port) {
  const interfaces = networkInterfaces();
  for (var k in interfaces) {
    let localIp = interfaces[k].find(inter => inter.family === 'IPv4' && !inter.internal);  
    if (localIp) {
      // Got tired of having to dig through system settings to find this :)
      console.log(`Navigate to https://${localIp.address}:${port} from other devices in your network`)
    }
  }

  return {
    key: fs.readFileSync('./resources/dev-cert/server.key'),
    cert: fs.readFileSync('./resources/dev-cert/server.crt'),
  };
}