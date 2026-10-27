import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const extension = new URL('../extension/lindex-safari/', import.meta.url);
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export async function packageExtension() {
  await mkdir(new URL('shared/', extension), { recursive: true });
  for (const name of ['profile.js', 'availability.js', 'transfer-contract.js']) await copyFile(new URL(`../public/${name}`, import.meta.url), new URL(`shared/${name}`, extension));
  const names = ['manifest.json', 'README.md', 'background.js', 'whool-bridge.js', 'lindex-content.js', 'shared/profile.js', 'shared/availability.js', 'shared/transfer-contract.js'];
  const chunks = [], directory = []; let offset = 0;
  for (const name of names) {
    const filename = Buffer.from(name), body = await readFile(new URL(name, extension)), crc = crc32(body);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(filename.length, 26);
    chunks.push(local, filename, body);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, filename); offset += local.length + filename.length + body.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  const result = Buffer.concat([...chunks, central, end]);
  await writeFile(new URL('../public/whool-lindex-safari.zip', import.meta.url), result, { mode: 0o600 });
  return { files: names.length, bytes: result.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await packageExtension()));
