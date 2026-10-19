// Local, lossless extraction from the user's reference. No image service is used.
import fs from 'node:fs';
import zlib from 'node:zlib';

const input = fs.readFileSync(new URL('../src/assets/login-reference.png', import.meta.url));
const width = input.readUInt32BE(16), height = input.readUInt32BE(20);
if (input[24] !== 8 || input[25] !== 2 || input[28] !== 0) throw new Error('Expected an 8-bit RGB, non-interlaced PNG.');
const parts = [];
for (let offset = 8; offset < input.length;) {
  const length = input.readUInt32BE(offset);
  if (input.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(input.subarray(offset + 8, offset + 8 + length));
  offset += length + 12;
}
const inflated = zlib.inflateSync(Buffer.concat(parts));
const pixels = Buffer.alloc(width * height * 3);
const paeth = (a, b, c) => { const p = a + b - c; const da = Math.abs(p-a), db = Math.abs(p-b), dc = Math.abs(p-c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
for (let y = 0; y < height; y++) {
  const filter = inflated[y * (width * 3 + 1)];
  for (let x = 0; x < width * 3; x++) {
    const index = y * width * 3 + x;
    const left = x >= 3 ? pixels[index-3] : 0, above = y ? pixels[index-width*3] : 0, corner = y && x >= 3 ? pixels[index-width*3-3] : 0;
    const prediction = [0, left, above, Math.floor((left+above)/2), paeth(left, above, corner)][filter];
    if (prediction === undefined) throw new Error('Invalid PNG filter.');
    pixels[index] = (inflated[y * (width * 3 + 1) + 1 + x] + prediction) & 255;
  }
}

// This box excludes the logo and form. All remaining pixels belong to the panda or navy backdrop.
const box = { x: 210, y: 230, width: 480, height: 470 };
const total = box.width * box.height;
const background = new Uint8Array(total);
const queue = new Int32Array(total);
let head = 0, tail = 0;
function rgb(x, y) { const start = ((y+box.y)*width+x+box.x)*3; return pixels.subarray(start, start+3); }
function isBackdrop(x, y) {
  const [r, g, b] = rgb(x,y);
  return r < 19 && g < 44 && b < 65 && b-r > 9;
}
function push(x,y) {
  if (x<0 || y<0 || x>=box.width || y>=box.height) return;
  const index = y*box.width+x;
  if (background[index] || !isBackdrop(x,y)) return;
  background[index] = 1; queue[tail++] = index;
}
for (let y=0;y<box.height;y++) { push(0,y); push(box.width-1,y); }
for (let x=0;x<box.width;x++) { push(x,0); push(x,box.height-1); }
while(head<tail) { const index=queue[head++], x=index%box.width, y=Math.floor(index/box.width); push(x-1,y); push(x+1,y); push(x,y-1); push(x,y+1); }

// Preserve the original pixels; only the alpha and edge color decontamination change.
const rgba = Buffer.alloc(total*4);
let transparent = 0, opaque = 0;
for (let y=0;y<box.height;y++) for(let x=0;x<box.width;x++) {
  const index=y*box.width+x, start=index*4;
  if (background[index]) { transparent++; continue; }
  const color=rgb(x,y);
  let adjacent=false;
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
    const nx=x+dx, ny=y+dy;
    if(nx>=0 && ny>=0 && nx<box.width && ny<box.height && background[ny*box.width+nx]) adjacent=true;
  }
  let alpha=255;
  if(adjacent) {
    // Slight feather at the silhouette, without erasing the black fur or blue clothes.
    const strength = Math.max(color[0]/19, color[1]/44, color[2]/65);
    alpha = Math.round(Math.min(1, Math.max(.25,(strength-.65)/.7))*255);
  }
  for(let c=0;c<3;c++) rgba[start+c]=Math.max(0,Math.min(255,Math.round((color[c] - (1-alpha/255)*[0,19,34][c])/(alpha/255))));
  rgba[start+3]=alpha; opaque++;
}
function crc32(buffer) {
  let crc=0xffffffff;
  for(const byte of buffer) { crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^0xffffffff)>>>0;
}
function chunk(type, data) {
  const name=Buffer.from(type), length=Buffer.alloc(4), checksum=Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,checksum]);
}
const header=Buffer.alloc(13); header.writeUInt32BE(box.width,0); header.writeUInt32BE(box.height,4); header[8]=8; header[9]=6;
const scanlines=Buffer.alloc(box.height*(box.width*4+1));
for(let y=0;y<box.height;y++) rgba.copy(scanlines,y*(box.width*4+1)+1,y*box.width*4,(y+1)*box.width*4);
const result=Buffer.concat([input.subarray(0,8),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(scanlines,{level:9})),chunk('IEND',Buffer.alloc(0))]);
fs.writeFileSync(new URL('../src/assets/panda-login-transparent.png', import.meta.url),result);
fs.writeFileSync(new URL('../public/preview-assets/panda-login-transparent.png', import.meta.url),result);
console.log(JSON.stringify({width:box.width,height:box.height,transparent,opaque,bytes:result.length}));
